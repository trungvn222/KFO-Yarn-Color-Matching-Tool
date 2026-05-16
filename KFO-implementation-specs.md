# KFO Yarn Tool — Implementation Specs

**Cập nhật:** 2026-05-16  
**Trạng thái:** Đang phát triển — Admin Tool hoàn thiện một phần

---

## 1. Kiến trúc tổng quan

```
Shopify Admin (Polaris UI)
       ↕ OAuth / App Bridge
  Remix App (server-side loaders/actions)
       ↕ algoliasearch SDK (Admin API Key — server only)
  Algolia Merchant Indexes
       ↕ Search-Only API Key (public)
  Storefront Widget (chưa build)
```

- **Framework:** Remix (Shopify CLI), TypeScript
- **Admin UI:** Shopify Polaris
- **Database:** Algolia — mỗi merchant có Algolia account riêng
- **Shopify APIs:** Admin API (product thumbnails, file uploads), App Bridge (resource picker, idToken)
- **Deployment:** chưa deploy

---

## 2. Cấu trúc file

```
app/
  algolia.server.ts          — App-level Algolia client + INDEXES constants
  merchantAlgolia.server.ts  — Factory: tạo merchant Algolia client từ shop credentials
  config.server.ts           — Đọc/ghi MerchantAlgoliaConfig, init merchant indexes
  shopify.server.ts          — Shopify auth setup
  types/kfo.ts               — TypeScript interfaces

  routes/
    app.tsx                  — Root layout (nav sidebar)
    app._index.tsx           — Combinations list (trang chủ admin)
    app.combinations.new.tsx — Tạo combination mới
    app.combinations.$id.edit.tsx — Sửa combination
    app.colors.tsx           — Quản lý colors
    app.tags.tsx             — Quản lý tags
    app.settings.tsx         — Algolia credentials
    app.sync.tsx             — Sync Shopify products → Algolia
    app.upload.tsx           — Upload ảnh lên Shopify Files API
    auth.login.tsx           — Shopify OAuth login
    webhooks.*.tsx           — Webhook handlers

  components/
    CombinationForm.tsx      — Form dùng chung cho New + Edit combination

scripts/
  init-merchant-indexes.mjs  — Tạo merchant indexes + set Algolia settings
  set-index-settings.mjs     — Áp lại Algolia settings (dùng khi index đã tồn tại)
  seed-settings.mjs          — Seed merchant config vào kfo_settings
  delete-merchant-indexes.mjs
  clear-sessions.mjs
  dev.mjs
```

---

## 3. Data Model thực tế (khác với spec gốc)

### 3.1 Algolia App-level: `kfo_settings`

Lưu credentials của từng merchant. Key = `shop` domain.

```json
{
  "objectID": "my-store.myshopify.com",
  "appId": "ALGOLIA_APP_ID",
  "adminApiKey": "ALGOLIA_ADMIN_KEY",
  "searchOnlyApiKey": "ALGOLIA_SEARCH_KEY"
}
```

> App Algolia credentials đọc từ env `ALGOLIA_APP_ID` + `ALGOLIA_ADMIN_API_KEY`.  
> Merchant credentials lưu trong `kfo_settings` của app Algolia.  
> Khi `DISABLE_ALGOLIA=true` (local dev), credentials lưu vào `merchant.config.json`.

### 3.2 `kfo_combinations`

```json
{
  "objectID": "uuid-v4",
  "name": "Combination name",
  "description": "",
  "image_url": "https://cdn.shopify.com/...",
  "position": 1,
  "tags": ["slug1", "slug2"],
  "colors": ["color-objectID-1", "color-objectID-2"],
  "products": [
    {
      "variant_id": "123456",
      "product_name": "Merino – Red",
      "position": 1,
      "image_url": "https://..."
    }
  ]
}
```

> **Khác với spec gốc:**
> - `colors` là array `objectID` của `kfo_colors` (không phải `color_slugs`)
> - `tags` là array `slug` của `kfo_tags`
> - `products[]` không lưu `color_name`, `color_hex` — chỉ lưu `variant_id`, `product_name`, `position`, `image_url`
> - Không có `primary_variant_id`

### 3.3 `kfo_colors`

```json
{
  "objectID": "color-slug",
  "name": "Red",
  "hex": "#FF0000",
  "image_url": "",
  "description": ""
}
```

> `objectID` = slug tạo từ name: `name.toLowerCase().replace(/\s+/g, "-")`

### 3.4 `kfo_tags`

```json
{
  "objectID": "tag-slug",
  "name": "Summer",
  "slug": "summer",
  "color": "#FFF9C4",
  "image_url": "",
  "description": ""
}
```

> `objectID` = `slug` = `name.toLowerCase().replace(/\s+/g, "-")`

---

## 4. Algolia Configuration (`kfo_combinations`)

Được set tự động mỗi khi merchant save Settings, và khi chạy `init-merchant-indexes.mjs`.

```js
{
  searchableAttributes: ["name", "description"],
  attributesForFaceting: ["tags", "colors"],
}
```

> **Để filter hoạt động:** `tags` và `colors` phải nằm trong `attributesForFaceting`.  
> Nếu index đã tồn tại mà chưa có settings, chạy: `node scripts/set-index-settings.mjs`

---

## 5. Admin — Settings (`/app/settings`)

- Merchant nhập: `Application ID`, `Admin API Key`, `Search-Only API Key`
- Khi Save:
  1. Ghi credentials vào `kfo_settings` (app Algolia)
  2. Tạo merchant indexes (`kfo_combinations`, `kfo_colors`, `kfo_tags`) nếu chưa có
  3. Gọi `setSettings` trên `kfo_combinations` với `searchableAttributes` + `attributesForFaceting`
- Guard: mọi route admin redirect về `/app/settings?required=1` nếu chưa config

---

## 6. Admin — Colors (`/app/colors`)

**CRUD hoàn chỉnh.**

| Thao tác | Chi tiết |
|---|---|
| List | DataTable: swatch (ảnh nếu có, else hex square), tên + objectID (subdued), hex, actions |
| Create | Modal: name, hex input, description, image upload (optional) |
| Edit | Modal: name, ID (disabled + helpText), hex, description, image |
| Delete | Modal flow (xem bên dưới) |

- **objectID** = slug từ name lúc tạo, cố định sau đó (không đổi khi rename)
- Edit bug fix: dùng `objectID` gốc từ formData, không regenerate slug từ name mới
- Image upload: POST `/app/upload` với `Authorization: Bearer <idToken>`
- Browse library: fetcher load `/app/upload` (GET trả danh sách files)
- Chờ Algolia `waitForTask` trước khi trả response

### Delete flow (Colors & Tags — dùng chung pattern)

1. Click Delete → `checkFetcher.submit({ intent: "check-*-usage", objectID })` → modal mở, hiện spinner
2. **Phase "confirming"**: hiện số combinations bị ảnh hưởng + nút Cancel / Delete
3. Click Delete → `deleteFetcher.submit({ intent: "delete", objectID })` → **phase "deleting"**
4. Progress bar tăng dần 5%/200ms đến 85% (fake), server xử lý:
   - Search combinations có facetFilter trên field tương ứng (`colors:id` hoặc `tags:slug`)
   - `Promise.all` update từng combination (xóa id/slug khỏi array)
   - Xóa record color/tag
5. Server trả `{ ok: true, removed: N }` → progress nhảy 100%, tone `success`
6. 600ms sau → modal tự đóng

---

## 7. Admin — Tags (`/app/tags`)

**CRUD hoàn chỉnh.** Cấu trúc và delete flow giống Colors.

| Thao tác | Chi tiết |
|---|---|
| List | DataTable: badge preview (bg-color square), tên + objectID (subdued), hex badge color, actions |
| Create | Modal: name, badge color (hex), description, image (optional) |
| Edit | Modal: name, ID (disabled + helpText), badge color, description, image |
| Delete | Modal flow (giống Colors — xem §6) |

---

## 8. Admin — Combinations List (`/app` — index)

### Loader params (URL)

| Param | Default | Mô tả |
|---|---|---|
| `q` | `""` | Search query |
| `tags` | `""` | Comma-separated tag slugs (OR filter) |
| `colors` | `""` | Comma-separated color objectIDs (OR filter) |
| `page` | `1` | Trang hiện tại (1-based, convert sang 0-based cho Algolia) |
| `perPage` | `20` | Số records/trang (options: 10, 20, 50, 100) |

### Algolia query

```js
facetFilters: [
  ["tags:slug1", "tags:slug2"],   // OR trong nhóm tags
  ["colors:id1", "colors:id2"],   // OR trong nhóm colors
]
// Hai nhóm AND với nhau
```

### UI

- **Search:** `TextField` debounce 300ms
- **Filters:** 2 nút `Popover` (Color + Tag), mỗi cái chứa `ChoiceList allowMultiple`
  - Button hiện count khi active: `Color (2)`, `Tag (1)`
  - `Clear all` xuất hiện khi có bất kỳ filter nào active
- **Table:** `IndexTable` (không có pagination dots như DataTable)
  - Columns: Image | Name | Products | Colors | Tags | Actions
  - Colors: hiện tối đa 5 dot màu (16px), hover = title tooltip, `+N` nếu > 5
- **Pagination:** `Pagination` component + label `page / nbPages`
- **Rows per page:** `Select` (10/20/50/100), reset về trang 1 khi đổi

---

## 9. Admin — Combination Form (New + Edit)

**Component dùng chung:** `app/components/CombinationForm.tsx`

### Layout

```
Left (2/3):                    Right (1/3):
┌─────────────────────┐        ┌──────────────┐
│ Name + Auto-name    │        │ Thumbnail    │
│ Description         │        ├──────────────┤
│ Display position    │        │ Colors       │
├─────────────────────┤        ├──────────────┤
│ Products            │        │ Tags         │
│ [Add product]       │        └──────────────┘
│ - row: ⠿ thumb,name │
│   variant ID        │
│   Remove            │
└─────────────────────┘
```

### Colors & Tags (Combobox dropdown)

- Polaris `Combobox` + `Listbox` + `AutoSelection.None`
- Gõ để filter options
- Click option → toggle selected + clear input
- Selected items hiện dưới dạng `Tag` với nút xóa
- Colors hiện dot màu bên cạnh tên

### Products

- `shopify.resourcePicker({ type: "product", multiple: true })` → App Bridge
- Mỗi variant trong product được thêm thành 1 row
- Product có nhiều variant → name = `"ProductTitle – VariantTitle"`
- `position` tự tính lại sau mỗi add/remove/reorder
- **Drag & drop reorder:** `@dnd-kit/core` + `@dnd-kit/sortable`
  - `SortableProductRow` component dùng `useSortable`, id = `variant_id`
  - Drag handle `⠿` ở đầu row, `touchAction: none` để hỗ trợ mobile
  - `handleDragEnd` dùng `arrayMove` rồi recalculate `position`
  - Row đang drag: `opacity: 0.5`, `background: #f6f6f7`
- Nút Remove (không còn ↑ ↓)

### Thumbnail

- Upload: POST `/app/upload` với idToken
- Browse library: fetcher load `/app/upload` (GET)
- Remove: clear `imageUrl` state

### Save

- Submit `{ data: JSON.stringify({...}) }` POST → action
- New: `randomUUID()` làm objectID
- Edit: giữ nguyên `objectID` từ params

---

## 10. Edit Combination — Fresh Product Thumbnails

**File:** `app/routes/app.combinations.$id.edit.tsx`

Sau khi load combination từ Algolia, loader query Shopify Admin GraphQL để lấy ảnh mới nhất:

```graphql
query getVariantImages($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      image { url }
      product { featuredImage { url } }
    }
  }
}
```

- Convert `variant_id` → GID: `gid://shopify/ProductVariant/${variant_id}`
- Ưu tiên: `variant.image.url` → fallback `product.featuredImage.url`
- Merge vào `combination.products` trước khi trả về client
- Route New không cần vì resource picker đã trả ảnh live từ Shopify

---

## 11. Image Upload (`/app/upload`)

- GET: list files từ Shopify Files (GraphQL query `files`)
- POST: upload file lên Shopify staged uploads rồi tạo File object
  - Requires `Authorization: Bearer <shopify-idToken>` header
  - Trả về `{ url }` của file đã upload
- Dùng cho: combination thumbnail, color image, tag image

---

## 12. Product Sync (`/app/sync`)

- Fetch Merino + SSM variants từ Shopify Admin API (`productByHandle`)
- Upsert vào Algolia index (chưa rõ index nào — cần xác nhận)
- Nút manual "Sync Products" trong UI

---

## 13. TypeScript Types

```ts
// app/types/kfo.ts
interface KfoProduct {
  variant_id: string;
  product_name: string;
  handle: string;
  position: number;
  image_url?: string;
}

interface KfoCombination {
  objectID: string;
  name: string;
  image_url: string;
  position: number;
  tags: string[];
  colors: string[];
  products: KfoProduct[];
}

interface KfoColor {
  objectID: string;
  name: string;
  hex: string;
  image_url?: string;
  description?: string;
}

interface KfoTag {
  objectID: string;
  name: string;
  slug: string;
  color: string;
  image_url?: string;
  description?: string;
}
```

---

## 14. Patterns quan trọng

### Merchant Algolia client
```ts
// Luôn dùng getMerchantAlgoliaClient — không tạo client trực tiếp trong route
const client = await getMerchantAlgoliaClient(session.shop);
```

### Guard config
```ts
const config = await requireMerchantConfig(session.shop);
if (!config) throw redirect("/app/settings?required=1");
```

### Admin GraphQL
```ts
const { admin } = await authenticate.admin(request);
const res = await admin.graphql(`#graphql query { ... }`, { variables: {} });
const data = await res.json();
```

### Polaris components dùng trong app
- List: `IndexTable` (không dùng `DataTable` — bị pagination dots)
- Multi-select search: `Combobox` + `Listbox` + `AutoSelection`
- Filter dropdown: `Popover` + `ChoiceList allowMultiple`
- Pagination: `Pagination` + `Select` (rows per page)
- Upload error: `Banner tone="critical"` inline, `onDismiss` để clear — không dùng `alert()`

### Drag & drop (product reorder)
```ts
// Dependencies: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
const sensors = useSensors(useSensor(PointerSensor));
// DndContext > SortableContext(items=variant_ids, strategy=verticalListSortingStrategy)
// useSortable({ id: variant_id }) trong SortableProductRow
// onDragEnd: arrayMove(prev, oldIndex, newIndex).map((p, i) => ({ ...p, position: i + 1 }))
```

---

## 15. Chưa implement

| Hạng mục | Ghi chú |
|---|---|
| Storefront Widget | Toàn bộ phần customer-facing |
| Theme App Extension | App Block cho Theme Editor |
| CSV Import | Bulk import combinations |
| Color/Tag rename → objectID drift | Tạo "Red" → objectID = "red". Đổi tên thành "Rouge" → objectID vẫn là "red", name hiện "Rouge". Không ảnh hưởng chức năng, chỉ confusing khi nhìn vào ID trong edit form. |
| Validation | Chưa validate form (tối thiểu 2 products, name required...) |
| ~~Error handling~~ | ~~Upload auth error (res không phải JSON) chưa handle trong colors/tags~~ — **Fixed** |
