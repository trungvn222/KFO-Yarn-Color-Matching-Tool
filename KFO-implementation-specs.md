# KFO Yarn Tool — Implementation Specs

**Cập nhật:** 2026-05-18 (rev 7)  
**Trạng thái:** Đang phát triển — Admin Tool + Storefront Widget hoàn thiện, chưa deploy

---

## 1. Kiến trúc tổng quan

```
Shopify Admin (Polaris UI)
       ↕ OAuth / App Bridge
  Remix App (server-side loaders/actions)
       ↕ algoliasearch SDK (Admin API Key — server only)
  Algolia Merchant Indexes
       ↕ Search-Only API Key (public)
  Theme App Extension (App Block — combinations.liquid)
       → kfo-widget.js (vanilla JS, loads algoliasearch@4 lite from CDN)
       → kfo-widget.css
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
    app.tsx                  — Root layout (nav: Combinations / Colors / Tags / Import / Settings)
    app._index.tsx           — Combinations list (trang chủ admin)
    app.combinations.new.tsx — Tạo combination mới
    app.combinations.$id.edit.tsx — Sửa combination
    app.colors.tsx           — Quản lý colors
    app.tags.tsx             — Quản lý tags
    app.settings.tsx         — Algolia credentials
    app.upload.tsx           — Upload ảnh lên Shopify Files API
    app.import.tsx           — Bulk import combinations từ CSV
    auth.login.tsx           — Shopify OAuth login
    webhooks.*.tsx           — Webhook handlers

  components/
    CombinationForm.tsx      — Form dùng chung cho New + Edit combination

extensions/
  kfo-widget/
    shopify.extension.toml   — Extension config (api_version 2026-04, type: theme)
    blocks/
      combinations.liquid    — App Block: combinations widget
      favorites.liquid       — App Block: favorites gallery (block riêng, độc lập)
    locales/
      en.default.json        — Required by Shopify CLI (empty, không dùng i18n)
    assets/
      kfo-widget.js          — Vanilla JS widget (IIFE, no build step)
      kfo-favorites.js       — Vanilla JS favorites gallery (IIFE, self-contained)
      kfo-widget.css         — Shared styles (dùng cho cả 2 block)
      kfo-heart.svg          — Heart icon (inactive)
      kfo-heart-active.png   — Heart icon (active)

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
| List | Search bar + DataTable (swatch, tên + objectID subdued, hex, actions) + phân trang |
| Create | Modal: name, hex, description, image upload (optional) |
| Edit | Modal: name, ID (disabled + helpText), hex, description, image |
| Delete | Modal flow (xem bên dưới) |

**objectID / slug:**
- `objectID` = `name.toLowerCase().replace(/\s+/g, "-")` khi tạo, cố định sau đó
- Edit: dùng `objectID` gốc từ formData, không regenerate từ name mới
- **Duplicate detection**: trước khi submit, compute `previewSlug` từ name → check trong `allIds` → hiện Banner warning + disable Save button

**Search + Pagination (giống Combinations index):**
- URL params: `q`, `page` (1-based), `perPage` (default 20, options 10/20/50/100)
- Loader query Algolia với `query: q, hitsPerPage: perPage, page: page-1`
- Loader cũng query riêng `allIds` (hitsPerPage: 1000, attributesToRetrieve: ["objectID"]) để duplicate check chính xác ngay cả khi đang search/phân trang
- UI: TextField debounce 300ms, Spinner khi loading, footer: total count + Select rows/page + Pagination

**Image upload:**
- POST `/app/upload` với `Authorization: Bearer <idToken>`
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

**CRUD hoàn chỉnh.** Cấu trúc, search, pagination, và delete flow giống Colors.

| Thao tác | Chi tiết |
|---|---|
| List | Search bar + DataTable (badge preview, tên + objectID subdued, hex badge color, actions) + phân trang |
| Create | Modal: name, badge color (hex), description, image (optional) |
| Edit | Modal: name, ID (disabled + helpText), badge color, description, image |
| Delete | Modal flow (giống Colors — xem §6) |

- `objectID` = `slug` = `name.toLowerCase().replace(/\s+/g, "-")`
- Duplicate detection giống Colors: dùng `allIds` từ loader, check client-side trước khi submit

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
<Page fullWidth>
  <Layout gap="600">                        ← spacing giữa 2 section
    <Layout.Section>                        ← left: 2/3
      <Card> Name / Description / Position </Card>
      <Box paddingBlockStart="600">         ← spacing trước Products
        <Card> Products </Card>
      </Box>
    </Layout.Section>
    <Layout.Section variant="oneThird">     ← right: 1/3
      Thumbnail / Colors / Tags
    </Layout.Section>
  </Layout>
</Page>
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

## 12. CSV Import (`/app/import`)

**Dependency:** `papaparse` (installed)  
**Nav:** Combinations → Colors → Tags → Import → Settings

### 12.1 Flow

```
Upload CSV file (DropZone)
  ↓ client-side parse (papaparse)
  ↓ validate mỗi row
Preview table (valid ✓ / invalid ✗ + error messages)
  ↓ click "Import N combinations"
POST action → saveObjects → Algolia
  ↓
Success banner: "Imported N combinations, M skipped"
```

### 12.2 CSV Format

```csv
name,description,position,image_url,colors,tags,variant_ids
"Summer Combo","Warm tones",1,"https://...","red|navy","summer|pastel","123456|789012"
```

| Column | Required | Mô tả |
|---|---|---|
| `name` | Yes | Tên combination |
| `description` | No | Mô tả ngắn |
| `position` | No | Số thứ tự sort |
| `image_url` | No | URL thumbnail |
| `colors` | No | Color names hoặc objectIDs, ngăn cách bằng `\|` |
| `tags` | No | Tag names hoặc slugs, ngăn cách bằng `\|` |
| `variant_ids` | No | Numeric Shopify variant IDs, ngăn cách bằng `\|` |

### 12.3 Client-side Validation (`validateRow`)

- `name` blank → error `"name required"`
- Color slug/name không khớp với bất kỳ color nào trong `kfo_colors` → error `"unknown color: X"`
- Tag slug/name không khớp → error `"unknown tag: X"`
- variant_id không phải số → error `"non-numeric variant_id: X"`
- Colors + Tags: match theo `objectID` hoặc `name.toLowerCase()` / `slug`

Invalid rows → hiện trong preview với Badge tone="critical", không được import.

### 12.4 Loader

```ts
// Fetch allColors + allTags để validation + reference sidebar
const [tagsRes, colorsRes] = await Promise.all([
  client.searchSingleIndex<KfoTag>({ indexName: INDEXES.tags, searchParams: { query: "", hitsPerPage: 1000 } }),
  client.searchSingleIndex<KfoColor>({ indexName: INDEXES.colors, searchParams: { query: "", hitsPerPage: 1000 } }),
]);
```

### 12.5 Action

```ts
// Nhận rows JSON từ formData, batch saveObjects
const objects = rows.map(row => ({
  objectID: randomUUID(),
  name, description, position, image_url,
  colors: row.colors,    // đã resolve sang objectID
  tags: row.tags,        // đã resolve sang slug
  products: row.variant_ids.map((id, i) => ({
    variant_id: id, product_name: "", position: i + 1,
  })),
}));
await client.saveObjects({ indexName: INDEXES.combinations, objects });
```

> `product_name` để trống — bổ sung sau khi user edit combination hoặc thêm lookup sau này.

### 12.6 UI Layout

```
<Page fullWidth title="Import Combinations">
  <Layout>
    <Layout.Section>          ← main: DropZone + preview table
    <Layout.Section variant="oneThird">   ← sidebar: format + colors + tags
```

**Sidebar:**
- **Download template** button → tạo Blob CSV, `<a download>` trigger
- **Column reference** table
- **Available Colors** — danh sách click-to-copy (copy `c.name` vào clipboard)
- **Available Tags** — danh sách click-to-copy (copy `t.slug` vào clipboard)

---

## 13. Theme App Extension — Storefront Widget

**Location:** `extensions/kfo-widget/`  
**Extension config:** `api_version = "2026-04"`, `type = "theme"`, `handle = "kfo-combinations-widget"`

### 13.1 Block schema (`blocks/combinations.liquid`)

Merchant cấu hình trong Shopify Theme Editor:

| Setting | Type | Default | Ghi chú |
|---|---|---|---|
| `algolia_app_id` | text | — | Required để widget render |
| `algolia_search_key` | text | — | Search-Only Key (không phải Admin Key) |
| `combinations_index` | text | "kfo_combinations" | |
| `colors_index` | text | "kfo_colors" | |
| `tags_index` | text | "kfo_tags" | |
| `per_page` | range 4–48 step 4 | 12 | Chỉ dùng ở flat mode |
| `show_search` | checkbox | false | Ẩn/hiện search bar — mặc định ẩn |
| `show_color_filter` | checkbox | true | Ẩn → filter locked (customer không toggle được) |
| `color_filter_label` | text | "FILTER BY COLORS:" | Label hiển thị trên filter bar |
| `show_tag_filter` | checkbox | true | |
| `default_colors` | text | — | Color objectID cách nhau dấu phẩy, VD: `red,navy-blue` |
| `default_tags` | text | — | Tag slug cách nhau dấu phẩy, VD: `summer,pastel` |

**Rule show + default:**
- `show=true` + default → pre-selected khi load, customer toggle được, Clear all → về lại default
- `show=false` + default → locked filter, customer không thể bỏ
- `show=false` + trống → filter ẩn, không apply gì thêm

Nếu `algolia_app_id` hoặc `algolia_search_key` blank → hiển thị error message thay vì widget.

Data truyền từ liquid vào JS qua `data-*` attributes trên `#kfo-widget`.

### 13.2 Widget JS (`assets/kfo-widget.js`)

- **Pattern:** IIFE, vanilla JS, không có build step — chạy thẳng trên browser
- **Algolia SDK:** lazy-load `algoliasearch@4` lite từ jsDelivr CDN (tránh bundle conflict với theme)
- **Init:** đọc `data-*` từ `#kfo-widget`, load allColors + allTags song song (hitsPerPage: 1000), render shell, gọi `renderContent()`

**State:**
```js
let query            = '';
let selectedColors   = [...defaultColors];  // khởi tạo từ default, không phải []
let selectedTags     = [...defaultTags];
let page             = 0;                   // chỉ dùng ở flat mode
let nbPages          = 1;
let allColors        = [];
let allTags          = [];
let colorsExpanded   = false;               // SEE MORE state
const sectionPerPage = {};                  // { colorId: hitsPerPage } — load more per section
const COLORS_COLLAPSED = 8;
```

**DOM structure:**
```
#kfo-widget
  .kfo-header              ← search input (debounce 300ms) — chỉ render nếu show_search=true
  .kfo-filters
    .kfo-filter-header     ← label (uppercase+underline) + #kfo-clear-btn
    #kfo-color-filters     ← .kfo-color-grid
    #kfo-tag-filters       ← tag badge buttons
  #kfo-grid                ← flat mode: .kfo-grid | section mode: .kfo-sections
  .kfo-pagination          ← chỉ hiện ở flat mode

document.body (appended ngoài #kfo-widget để tránh overflow/z-index)
  .kfo-modal-overlay#kfo-modal-overlay
    .kfo-modal
      .kfo-modal-body#kfo-modal-body
```

> Modal mount vào `document.body` thay vì `#kfo-widget` để tránh bị clip bởi `overflow: hidden` của parent.

**renderContent() — dispatch logic:**
```
selectedColors.length > 0  →  renderSections()  (pagination ẩn)
selectedColors.length === 0 →  renderFlat()     (pagination hiện)
```

**Flat mode (không chọn color):**
```js
// 1 query, grid + pagination
facetFilters: [["tags:slug1", "tags:slug2"]]  // chỉ tags
hitsPerPage: perPage, page: page
```

**Section mode (chọn 1+ colors):**
```js
// N queries song song — mỗi color 1 query
// Sort sections theo index của color trong allColors (= position Algolia)
facetFilters: [
  ["colors:colorId"],              // color cụ thể của section
  ["tags:slug1", "tags:slug2"],   // tags filter (nếu có) — AND với color
]
hitsPerPage: sectionPerPage[colorId] || 6
```
- Load more: `sectionPerPage[colorId] += 6` → re-query chỉ section đó
- Deselect color → `delete sectionPerPage[colorId]` (reset load-more state)

**Color filter UI (`.kfo-color-grid`):**
- Grid 5 cột (tablet: 3, mobile: 2)
- Mỗi item: swatch tròn **60×60px** (ảnh nếu `color.image_url` có, else hex fill) + tên uppercase 14px
- Collapsed: hiện 8 colors + pill button "SEE MORE"
- `colorsExpanded = true` → hiện tất cả, không còn SEE MORE
- Active: border `#111` quanh swatch + tên bold

**Section header:**
```
[ảnh 140×140px bo góc] hoặc [ô màu hex]    Tên color (18px, semibold)
                                             description (14px, #6b7280, nếu có)
──────────────────────────────────── (border-bottom)
[card][card][card][card][card][card]   ← 6 cards default
[+N more button]                       ← load +6 mỗi lần
```

**Card design:**
- Không có border/card background — image flush
- Ảnh: aspect-ratio 1:1, `object-fit: cover`
- Heart button: absolute top-right (28×28px), dùng `kfo-heart.svg` (inactive) / `kfo-heart-active.png` (active), lưu vào `localStorage` key `kfo_favorites`
- Tên combination: 18px, dưới ảnh
- Nút "VIEW DETAIL": full-width, bordered, 14px — click → openModal (stopPropagation)

**Heart icons — 3 vị trí:**
| Vị trí | Icon size | Container |
|---|---|---|
| Card (top-right image) | 28×28px | absolute, top:8 right:8, no padding |
| Modal image overlay | 28×28px | 48px circle button |
| Modal fav button (inline) | 24×24px | inline flex với text |

**Custom heart assets:**
- Inactive: `assets/kfo-heart.svg` → `data-heart-url` attribute
- Active: `assets/kfo-heart-active.png` → `data-heart-active-url` attribute
- Toggle: thay `src` của `<img>` trực tiếp, không re-render card

**Clear all:** chỉ hiện khi state khác với defaultColors/defaultTags hoặc có query. Reset về default, không về rỗng.

**Tag filter:** badge pills, active background = tag.color. Không đổi.

**Favorites (localStorage):**
```js
const FAV_KEY = 'kfo_favorites';
getFavs()   // → string[]
isFav(id)   // → boolean
toggleFav(id) // thêm/xóa khỏi array, persist, dispatch 'kfo:favorites-changed'
```
- Sync card ↔ modal khi toggle trong modal
- `toggleFav` dispatch `window.dispatchEvent(new CustomEvent('kfo:favorites-changed'))` sau mỗi lần gọi
- `kfo-widget.js` listen `kfo:favorites-changed` → cập nhật tất cả `.kfo-heart-btn` đang hiển thị
- `kfo-favorites.js` listen `kfo:favorites-changed` → re-render toàn bộ favorites grid
- Cả 2 chiều đều realtime khi 2 block cùng trang

**Modal layout (2 cột):**
```
┌──────────────────────┬──────────────────────────┐
│  .kfo-modal-left     │  .kfo-modal-right        │
│  (flex: 0 0 45%)     │  (flex: 1)               │
│                      │  [×] close               │
│  [main image]        │  COMBINATION NAME (18px) │
│                      │  [♡ ADD TO FAVORITE]     │
│  [hover overlay]     │  description (14px)      │
│  [♡ fav] [⊕ zoom]   │  .kfo-cart-msg (banner)  │
│                      │  .kfo-modal-products-grid│
│                      │    2 cột, mỗi ô:         │
│                      │    ảnh + [ADD TO CART]   │
└──────────────────────┴──────────────────────────┘
```
- Image overlay actions: visible khi hover `.kfo-modal-left`, centered, opacity transition
- Zoom button → lightbox: `div.kfo-lightbox` append to `document.body`, có nút ✕ + click-outside để đóng
- Modal close: click ✕ hoặc click overlay background

**Add to Cart:**
```js
POST /cart/add.js
body: { items: [{ id: numericVariantId, quantity: 1 }] }
// variant_id trong Algolia là numeric string — xử lý cả GID: String(id).split('/').pop()
```
- Button states: `ADD TO CART` → `...` (loading) → `ADDED ✓` (black fill, 2s) / `FAILED` (red, 3s)
- Error message: `.kfo-cart-msg` banner 18px hiển thị trên products grid, lấy `err.description` từ Shopify API response
- Sau khi add thành công: dispatch `cart:refresh` + `theme:cart:open` (tích hợp với cart drawer theme)

**Font sizes (minimum 14px toàn widget):**
| Element | Size |
|---|---|
| Filter label, color name, tag badge, clear btn | 14px |
| See more, badge, view detail btn | 14px |
| Card name | 18px |
| Section title | 18px |
| Section desc | 14px |
| Page btn / label | 0.9rem (~14px) |
| Modal title, close btn | 18px |
| Modal fav btn, desc | 14px |
| ADD TO CART btn, cart message | 18px |

### 13.3 CSS (`assets/kfo-widget.css`)

- Dùng chung cho **cả 2 block** (`kfo-widget.js` + `kfo-favorites.js`)
- `#kfo-widget { width: 100%; box-sizing: border-box; }` — không padding, không max-width
- Modal body dùng **class** `.kfo-modal-body` (không phải ID) để cả 2 modal dùng chung style: `display: flex; width: 100%`
- Modal: `position: fixed`, `z-index: 9999`, max-width 820px, max-height 90vh, flex row (left 45% + right flex:1)
- `.kfo-modal-img-actions { position: absolute; inset: 0; opacity: 0; }` + `.kfo-modal-left:hover .kfo-modal-img-actions { opacity: 1; }`
- `.kfo-lightbox { position: fixed; z-index: 10000; }` — trên modal
- `#kfo-grid` dùng class động: `.kfo-grid` (flat) hoặc `.kfo-sections` (section mode)
- `.kfo-modal-products-grid { grid-template-columns: repeat(2, 1fr); }` — 2 cột cố định
- `.kfo-cart-msg { display: none; }` — toggle bằng JS, hiện trước products grid
- Spinner: `kfo-spin` keyframe, border-top-color `#008060`
- Responsive breakpoints: 768px (color grid 3 cột, modal thành 1 cột), 480px (color grid 2 cột, card grid 2 cột)

### 13.4 Favorites Block (`blocks/favorites.liquid` + `assets/kfo-favorites.js`)

**Mục đích:** Block độc lập để merchant thêm vào bất kỳ page nào (VD: "My Favorites") — hiện danh sách combinations đã được customer lưu.

**Schema tối giản:**
| Setting | Type | Default |
|---|---|---|
| `algolia_app_id` | text | — |
| `algolia_search_key` | text | — |
| `combinations_index` | text | "kfo_combinations" |

**`kfo-favorites.js` — flow:**
1. Đọc `favIds` từ `localStorage['kfo_favorites']`
2. Nếu rỗng → hiện empty state
3. Fetch bằng `combIndex.search('', { filters: 'objectID:"id1" OR objectID:"id2"', hitsPerPage: N })`  
   _(dùng `search` thay vì `getObjects` vì algoliasearch-lite không có `getObjects`)_
4. Render grid card + modal giống hệt combinations widget
5. Click heart trong favorites → unfavorite + xóa card khỏi grid ngay

**DOM structure:**
```
#kfo-favorites
  #kfo-fav-grid (.kfo-grid)

document.body
  .kfo-modal-overlay#kfo-fav-modal-overlay
    .kfo-modal
      .kfo-modal-body#kfo-fav-modal-body
```

**Realtime sync (2 chiều):**
```
toggleFav(id) → localStorage + dispatchEvent('kfo:favorites-changed')

kfo-widget.js:  window.on('kfo:favorites-changed') → cập nhật tất cả .kfo-heart-btn trong grid
kfo-favorites.js: window.on('kfo:favorites-changed') → renderFavorites() lại toàn bộ
```

**`loadScript` race condition fix:**
```js
// Cả 2 file dùng cùng pattern:
if (window.algoliasearch) { resolve(); return; }          // đã load xong
const existing = document.querySelector(`script[src]`);
if (existing) { existing.addEventListener('load', resolve); return; } // đang load
// → tạo mới
```
Tránh trường hợp 2 block cùng trang: file thứ 2 resolve sớm trước khi Algolia sẵn sàng.

---

## 14. TypeScript Types (`app/types/kfo.ts`)

```ts
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

## 15. Patterns quan trọng

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

### Full-width layout pattern (tất cả các route)
```tsx
// Mọi Page đều dùng fullWidth
<Page fullWidth title="...">
  <Layout>
    // Section đơn → fullWidth
    <Layout.Section variant="fullWidth">...</Layout.Section>

    // Form 2 cột → giữ nguyên oneThird (CombinationForm)
    <Layout.Section>...</Layout.Section>
    <Layout.Section variant="oneThird">...</Layout.Section>
  </Layout>
</Page>
```
- `<Page fullWidth>`: bỏ max-width của Page container
- `<Layout.Section variant="fullWidth">`: bỏ max-width của section
- Cả 2 cần thiết vì Polaris giới hạn width ở 2 cấp độ

### Drag & drop (product reorder)
```ts
// Dependencies: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
const sensors = useSensors(useSensor(PointerSensor));
// DndContext > SortableContext(items=variant_ids, strategy=verticalListSortingStrategy)
// useSortable({ id: variant_id }) trong SortableProductRow
// onDragEnd: arrayMove(prev, oldIndex, newIndex).map((p, i) => ({ ...p, position: i + 1 }))
```

---

## 16. Chưa implement

| Hạng mục | Ghi chú |
|---|---|
| **Form validation** | Name required, tối thiểu 2 products... |
| ~~Favorites gallery~~ | ~~Chưa có view xem danh sách~~ — **Done**: block `favorites.liquid` + `kfo-favorites.js`, realtime sync 2 chiều |
| **Deploy** | `vercel.json` đã có, chưa push GitHub + set env vars trên Vercel |
| ~~Sync Products~~ | ~~Route `/app/sync`~~ — **Removed**: products chọn trực tiếp qua Resource Picker, không cần sync riêng |
| ~~CSV Import~~ | ~~Bulk import combinations~~ — **Done**: `app.import.tsx`, DropZone + client-side validate + preview + batch saveObjects (§12) |
| Color/Tag rename → objectID drift | Tạo "Red" → objectID = "red". Đổi tên thành "Rouge" → objectID vẫn là "red". Không ảnh hưởng chức năng. |
| ~~Add to Cart~~ | ~~Chưa có nút cart~~ — **Done**: `POST /cart/add.js`, error banner, cart:refresh event |
| ~~Favorites toggle~~ | ~~Chưa implement~~ — **Done** (xem §16.1) |

### 16.1 Favorites toggle — chi tiết

**Storage:** `localStorage`, key `kfo_favorites`, value = JSON array of `objectID` strings.

```js
const FAV_KEY = 'kfo_favorites';
function getFavs()     { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
function isFav(id)     { return getFavs().includes(id); }
function toggleFav(id) {
  const favs = getFavs();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1); else favs.push(id);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}
```

**3 entry points để toggle:**

| Vị trí | Element | Hành vi |
|---|---|---|
| Card (flat & section mode) | `.kfo-heart-btn` (top-right image) | `stopPropagation` → toggleFav → swap icon src + toggle class `.active` |
| Modal image overlay | `#kfo-modal-img-fav` | toggleFav → swap icon src trong overlay + sync fav button + sync card heart nếu đang hiển thị |
| Modal right panel | `#kfo-modal-fav` | Proxy: gọi `.click()` trên `#kfo-modal-img-fav` → dùng chung handler |

**Icon swap (không re-render):**
```js
btn.querySelector('.kfo-heart-icon').src = active ? heartActiveUrl : heartUrl;
```
- `heartUrl` = `data-heart-url` → `assets/kfo-heart.svg`
- `heartActiveUrl` = `data-heart-active-url` → `assets/kfo-heart-active.png`

**Sync card ↔ modal:**  
Khi toggle trong modal, widget tìm card tương ứng trên DOM và cập nhật icon + class `.active` để giữ đồng bộ mà không cần re-query Algolia.

**Persist across page load:**  
`isFav(id)` được gọi tại thời điểm render `cardHtml()` và `openModal()` — trạng thái active/inactive phản ánh localStorage hiện tại.

| ~~Error handling~~ | ~~Upload auth error~~ — **Fixed** |
| ~~Storefront Widget~~ | ~~Toàn bộ phần customer-facing~~ — **Done (§13)** |
| ~~Theme App Extension~~ | ~~App Block cho Theme Editor~~ — **Done (§13)** |
