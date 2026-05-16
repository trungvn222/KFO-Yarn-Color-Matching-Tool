# KFO Yarn Color Matching Tool - Danh sách công việc

## Tổng quan dự án
Xây dựng Shopify App cho Knitting for Olive gồm 2 phần:
1. **Admin Tool** - Merchant quản lý các tổ hợp màu (Merino + SSM) trực tiếp trong Shopify Admin
2. **Storefront Widget** - Khách hàng chọn màu, filter theo tag, xem tổ hợp, add to cart

> Mỗi "combined product" là visual only - không có Inventory, không có Pricing riêng.
> Dữ liệu lưu trên **Algolia** (thay thế Google Sheet và database truyền thống).

---

## Phase 1 - Thông số cố định
- Yarn 1: **Merino** (user chọn màu)
- Yarn 2: **Soft Silk Mohair (SSM)** (hệ thống gợi ý)
- Một Merino màu → nhiều tổ hợp SSM kết hợp

---

## Danh sách công việc

### 1. Thiết lập dự án
- [ ] Khởi tạo Shopify App (Shopify CLI + Remix)
- [ ] Cài đặt Shopify App Bridge, Polaris
- [ ] Cấu hình OAuth, scopes: `read_products`
- [ ] Tạo Algolia account + App + 3 index: `kfo_combinations`, `kfo_tags`, `kfo_colors`
- [ ] Cài đặt Algolia JS SDK (`algoliasearch`)
- [ ] Deploy môi trường dev (ngrok hoặc Cloudflare Tunnel)

### 2. Algolia Index Setup
- [ ] Tạo index `kfo_combinations` với cấu trúc record:
  ```json
  {
    "objectID": "uuid",
    "name": "Red + Pink + Cream",
    "image_url": "https://...",
    "position": 1,
    "tags": ["summer", "pastel"],
    "primary_variant_id": "123456",
    "color_slugs": ["red", "pink", "cream"],
    "products": [
      {
        "variant_id": "123456",
        "product_name": "Merino",
        "color_name": "Red",
        "color_slug": "red",
        "color_hex": "#FF0000",
        "position": 1
      },
      {
        "variant_id": "789012",
        "product_name": "Soft Silk Mohair",
        "color_name": "Pink",
        "color_slug": "pink",
        "color_hex": "#FFC0CB",
        "position": 2
      }
    ]
  }
  ```
  > `color_slugs`: denormalize từ `products[].color_slug` — dùng để Algolia facet filter hiệu quả
  > `primary_variant_id`: sản phẩm dùng làm swatch chính trên storefront (do merchant chỉ định)
- [ ] Tạo index `kfo_colors` với cấu trúc record:
  ```json
  { "objectID": "red", "name": "Red", "hex": "#FF0000" }
  ```
- [ ] Tạo index `kfo_tags` với cấu trúc record:
  ```json
  { "objectID": "summer", "name": "Summer", "slug": "summer", "color": "#FFF9C4" }
  ```
- [ ] Cấu hình **searchable attributes**: `name`, `tags`, `products.color_name`, `products.product_name`
- [ ] Cấu hình **filters**: `primary_variant_id`, `tags`, `products.variant_id`, `color_slugs`
- [ ] Cấu hình **facets**: `tags`, `color_slugs`
- [ ] Cấu hình **ranking**: theo `position`
- [ ] Tạo **Search-Only API Key** cho storefront (public, read-only)
- [ ] Giữ **Admin API Key** ở server (private, CRUD)

### 3. Đồng bộ Shopify Products
- [ ] Fetch toàn bộ Merino variants từ Shopify Admin API
- [ ] Fetch toàn bộ SSM variants từ Shopify Admin API
- [ ] Nút "Sync Products" trong admin để cập nhật danh sách variants mới nhất

### 4. Admin UI - Quản lý Colors
- [ ] Trang danh sách colors (table: swatch, tên, slug, số combinations đang dùng)
- [ ] Tạo mới color (name, slug tự generate, color picker cho hex)
- [ ] Sửa color (đổi tên, hex — tự động cập nhật `color_slugs` trong combinations liên quan)
- [ ] Xoá color (cảnh báo nếu đang dùng)
- [ ] Mọi thao tác CRUD ghi lên Algolia index `kfo_colors`

### 4b. Admin UI - Quản lý Tags
- [ ] Trang danh sách tags (table: tên, slug, màu, số combinations đang dùng)
- [ ] Tạo mới tag (name, slug tự generate, color picker)
- [ ] Sửa tag
- [ ] Xoá tag (cảnh báo nếu tag đang được dùng trong combinations)
- [ ] Mọi thao tác CRUD ghi lên Algolia index `kfo_tags`

### 5. Admin UI - Quản lý Combinations
- [ ] **Danh sách** tổ hợp (table: ảnh, tên, số sản phẩm, tags, actions)
- [ ] **Filter theo tag** trong admin list view
- [ ] **Tạo mới** tổ hợp:
  - Tên tổ hợp (auto-generate từ tên các sản phẩm hoặc nhập tay)
  - **Dynamic product list**: nút "Add Product" → chọn variant từ Shopify, chọn color từ `kfo_colors` (hoặc tạo color mới)
  - Tối thiểu 2 sản phẩm, không giới hạn tối đa
  - Kéo thả để sắp xếp thứ tự sản phẩm trong tổ hợp
  - Chỉ định **Primary Product** (dùng làm swatch trên storefront)
  - `color_slugs` tự động tổng hợp từ các sản phẩm trong tổ hợp khi lưu
  - Upload ảnh kết quả
  - Tag picker (multi-select từ `kfo_tags`)
- [ ] **Sửa** tổ hợp (thêm/bớt/đổi sản phẩm, đổi primary)
- [ ] **Xoá** tổ hợp
- [ ] **Sắp xếp thứ tự** hiển thị giữa các tổ hợp (position field)
- [ ] **Import từ Google Sheet** (optional - migration 1 lần)
- [ ] Mọi thao tác CRUD ghi lên Algolia index `kfo_combinations`

### 6. Storefront Widget - Color & Tag Filter
- [ ] Fetch danh sách colors từ `kfo_colors` → render color swatch pills (dùng `hex` để hiển thị)
- [ ] Fetch danh sách tags từ `kfo_tags` → render tag pills
- [ ] Multi-select colors → filter Algolia bằng `facetFilters: [color_slugs]`
- [ ] Multi-select tags → filter Algolia bằng `facetFilters: [tags]`
- [ ] Color filter + Tag filter + Primary swatch filter hoạt động đồng thời
- [ ] Hiển thị số lượng kết quả của mỗi color/tag từ `facetHits`
- [ ] Nút reset filter

### 7. Storefront Widget - Color Swatch Selection
- [ ] Fetch danh sách `primary_variant_id` distinct từ Algolia
- [ ] Render grid ô màu swatch dùng `color_hex` của primary product
- [ ] Trạng thái selected/hover
- [ ] Responsive (mobile + desktop)

### 8. Storefront Widget - Results Grid
- [ ] Query Algolia: filter theo `primary_variant_id` + `tags` đã chọn
- [ ] Hiển thị tối đa 10 tổ hợp (Algolia `hitsPerPage: 10`)
- [ ] Mỗi card hiển thị: ảnh, tên tổ hợp, danh sách sản phẩm (N items), tags
- [ ] Nút "Show More" dùng Algolia pagination + hiển thị số còn lại từ `nbHits`

### 9. Storefront Widget - Detail Popup
- [ ] Popup: ảnh tổ hợp, danh sách N sản phẩm với tên + màu, tags
- [ ] Nút Add to Cart thêm đồng thời **tất cả N variants** vào giỏ hàng
- [ ] Xử lý Shopify Storefront API cart mutation (lines array với N items)

### 10. Storefront Widget - Favorites
- [ ] Lưu `objectID` tổ hợp yêu thích vào localStorage
- [ ] Fetch lại details từ Algolia khi mở gallery
- [ ] Gallery quản lý danh sách yêu thích
- [ ] Xoá, mở lại từng tổ hợp

### 11. Nhúng vào Storefront
- [ ] Tạo Theme App Extension (App Block)
- [ ] Merchant thêm widget qua Shopify Theme Editor
- [ ] Widget dùng Algolia Search-Only API Key (public, an toàn)

### 12. Testing & QA
- [ ] Test CRUD tags trong admin
- [ ] Test CRUD combinations + filter theo tag trong admin
- [ ] Test sync Shopify products
- [ ] Test storefront: filter tag → chọn màu → xem kết quả → add to cart
- [ ] Test favorites save/restore
- [ ] Test mobile

### 13. Deploy
- [ ] Deploy app lên production (Vercel hoặc Railway)
- [ ] Cài app lên Shopify store KFO
- [ ] Kiểm tra Search-Only Key không bị expose Admin Key

---

## Estimation

| # | Hạng mục | Ngày | Ghi chú |
|---|---|---|---|
| 1 | Thiết lập dự án | 1 | |
| 2 | Algolia Index Setup (3 indexes) | 1 | Tăng do thêm `kfo_colors`, cấu hình facets |
| 3 | Đồng bộ Shopify Products | 1 | |
| 4 | Admin UI - Quản lý Colors | 1.5 | Mới thêm |
| 4b | Admin UI - Quản lý Tags | 1.5 | |
| 5 | Admin UI - Quản lý Combinations | 5 | Tăng do dynamic N products, drag & drop, color picker |
| 6 | Storefront - Color & Tag Filter | 2 | Tăng do 3 filter kết hợp + facet count |
| 7 | Storefront - Color Swatch Selection | 1.5 | |
| 8 | Storefront - Results Grid | 1.5 | |
| 9 | Storefront - Detail Popup + Add to Cart N items | 2 | |
| 10 | Storefront - Favorites | 1.5 | |
| 11 | Theme App Extension | 1.5 | |
| 12 | Deploy | 0.5 | |
| | **Tổng** | **~21.5 ngày (~172h)** | |

---

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Framework | Remix (Shopify CLI official) |
| Admin UI | Shopify Polaris |
| Shopify | Admin API (products sync) + Storefront API (cart) |
| Database | **Algolia** (index: `kfo_combinations`, `kfo_tags`) |
| Storefront Query | Algolia JS SDK (client-side, Search-Only Key) |
| Admin CRUD | Algolia REST API (server-side, Admin Key) |
| Storefront Widget | React + Tailwind CSS |
| Favorites | localStorage (lưu objectID, fetch từ Algolia) |
| Deploy | Vercel / Railway |

---

## Lưu ý bảo mật Algolia
- **Search-Only API Key**: public, nhúng vào storefront widget — chỉ đọc
- **Admin API Key**: private, chỉ dùng ở server (Remix loader/action) — không bao giờ expose ra client
