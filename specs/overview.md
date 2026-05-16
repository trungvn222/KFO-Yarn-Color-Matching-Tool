# KFO Yarn Color Matching Tool — Spec Overview

Shopify embedded app (Remix + Vite) cho phép merchant quản lý tổ hợp màu sợi len (combinations), màu (colors), và nhãn (tags). Data lưu trên Algolia. Ảnh upload lên Shopify CDN.

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Remix (flat routes, `@remix-run/fs-routes`) |
| UI | Shopify Polaris + App Bridge |
| Data | Algolia (per-merchant index) |
| Session | Redis (Upstash) |
| Image | Shopify Staged Uploads API (`write_files` scope) |
| Auth | `@shopify/shopify-app-remix`, offline token, legacy install flow |

## Scopes

```
read_products, write_files
```

> `write_files` bao gồm cả read access — dùng để upload và list ảnh từ Shopify Files API.

## Algolia indexes (per merchant)

| Index | Dữ liệu |
|---|---|
| `kfo-colors` | Danh sách màu |
| `kfo-tags` | Danh sách nhãn |
| `kfo-combinations` | Tổ hợp màu |

## Modules

- [Colors](./colors.md)
- [Tags](./tags.md)
- [Combinations](./combinations.md)
- [Image Upload](./image-upload.md)
- [Dev Automation](./dev-automation.md)
