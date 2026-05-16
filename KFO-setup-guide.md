# KFO Yarn Tool — Setup Guide

## 1. Shopify Partners — Lấy API Keys

1. Vào [partners.shopify.com](https://partners.shopify.com) → **Apps**
2. Chọn app **KFO Yarn Color Matching Tool** (hoặc tạo mới: **Create app** → **Create app manually**)
3. Vào tab **Client credentials**
4. Copy:
   - **Client ID** → `SHOPIFY_API_KEY`
   - **Client secret** → `SHOPIFY_API_SECRET`

---

## 2. Chạy ngrok (terminal 1)

```bash
ngrok http 3000
```

Copy URL ngrok in ra, dạng: `https://xxxx.ngrok-free.app`

---

## 3. Điền `.env`

```env
SHOPIFY_API_KEY=<Client ID>
SHOPIFY_API_SECRET=<Client secret>
SCOPES=read_products
SHOPIFY_APP_URL=https://xxxx.ngrok-free.app   # URL từ bước 2

ALGOLIA_APP_ID=Z2OBLXJUCJ
ALGOLIA_ADMIN_API_KEY=<admin key>
ALGOLIA_SEARCH_ONLY_API_KEY=<search-only key>
```

---

## 4. Cập nhật `shopify.app.toml`

```toml
application_url = "https://xxxx.ngrok-free.app"
embedded = true

[auth]
redirect_urls = [
  "https://xxxx.ngrok-free.app/auth/callback",
  "https://xxxx.ngrok-free.app/auth/shopify/callback",
  "https://xxxx.ngrok-free.app/api/auth/callback"
]
```

> **Lưu ý:** Mỗi lần restart ngrok, URL sẽ đổi — cần cập nhật lại `.env` và `shopify.app.toml`.  
> Dùng [ngrok static domain](https://dashboard.ngrok.com/cloud-edge/domains) để giữ URL cố định.

---

## 5. Chạy dev server (terminal 2)

```bash
nvm use 22.13.1

# Kết nối project với app trên Partners (chỉ cần chạy 1 lần)
shopify app config link

# Khởi động dev server
yarn dev
```

---

## 6. Cài app lên store dev

Sau khi `yarn dev` chạy, CLI sẽ in ra link dạng:

```
Preview URL: https://<store>.myshopify.com/admin/apps/kfo-yarn-color-matching-tool
```

Mở link đó để cài app lên store test.

---

## 7. Algolia Index Setup (chạy 1 lần)

Vào [algolia.com](https://www.algolia.com) → App **Z2OBLXJUCJ** → tạo 3 indexes:

| Index | Dùng cho |
|---|---|
| `kfo_combinations` | Danh sách tổ hợp màu |
| `kfo_colors` | Thư viện màu sắc |
| `kfo_tags` | Tags để filter |

### Cấu hình `kfo_combinations`

- **Searchable attributes:** `name`, `tags`, `products.color_name`, `products.product_name`
- **Attributes for faceting:** `tags`, `color_slugs`
- **Custom ranking:** `asc(position)`

---

## 8. Tech Stack

| Layer | Công nghệ |
|---|---|
| Framework | Remix (Shopify CLI) |
| Admin UI | Shopify Polaris |
| Database | Algolia |
| Storefront Widget | React + Tailwind CSS |
| Deploy | Vercel / Railway |
