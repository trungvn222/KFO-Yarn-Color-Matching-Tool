# Dev Automation

Script: `scripts/dev.mjs`
Command: `npm run dev:ngrok`

## Mục đích

Chạy 1 lệnh duy nhất để:
1. Kill process cũ trên port 3000 và ngrok cũ
2. Khởi động ngrok, lấy HTTPS URL
3. Cập nhật `shopify.app.toml` (application_url + redirect_urls)
4. Cập nhật `.env` (SHOPIFY_APP_URL)
5. Deploy config lên Shopify Partner Dashboard (`shopify app deploy`)
6. Khởi động Vite dev server

## Flow chi tiết

```
kill :3000 + pkill ngrok
→ spawn ngrok http 3000
→ poll localhost:4040/api/tunnels (max 20s) → lấy HTTPS URL
→ update shopify.app.toml: application_url + redirect_urls
→ update .env: SHOPIFY_APP_URL
→ npx shopify app deploy --allow-updates --no-build
→ npm run dev:vite (với SHOPIFY_APP_URL env)
```

Deploy lỗi thì warn và tiếp tục (không exit).

## Lưu ý scopes

File `.env` SCOPES phải khớp với `shopify.app.toml` scopes, nếu không OAuth flow sẽ fail khi install.

Current scopes: `read_products,write_files`

> `write_files` là scope bình thường, deploy được.
> `read_files` / `read_images` là protected scope — deploy bị reject với lỗi "scopes: read_images".

## Session management

Script xóa session Redis khi cần re-auth:
```
REDIS_URL="..." node scripts/clear-sessions.mjs
```

Keys pattern: `shopify_sessions_offline_{shop}`, `shopify_sessions_{shop}`, `shopify_sessions_migrations`
