# Image Upload

Route: `/app/upload`
File: `app/routes/app.upload.tsx`

## Scope required

`write_files` — bao gồm cả read access đến Shopify Files API.

## GET — List images (Browse library)

Trả về danh sách URL ảnh đã upload lên Shopify Files, sắp xếp mới nhất trước.

```
GET /app/upload
→ { files: string[] }
```

GraphQL query:
```graphql
query {
  files(first: 50, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        fileStatus
        ... on MediaImage {
          id
          image { url }
        }
      }
    }
  }
}
```

Chỉ trả về file có `fileStatus === "READY"` và có `image.url`.

## POST — Upload image

Upload ảnh mới lên Shopify CDN qua Staged Uploads API.

```
POST /app/upload
Body: FormData { file: File }
Headers: Authorization: Bearer <App Bridge idToken>
→ { url: string } | { error: string }
```

### Flow

1. **Staged upload**: `stagedUploadsCreate` mutation với `resource: "IMAGE"` → nhận `url` (CDN endpoint) + `parameters` + `resourceUrl`
2. **Upload CDN**: POST multipart form đến `url` với các `parameters` + file
3. **Register file**: `fileCreate` mutation với `originalSource: resourceUrl` → nhận `id`
4. **Poll**: query `node(id)` mỗi 800ms tối đa 15 lần cho đến khi `fileStatus === "READY"`
5. **Return**: trả về `image.url` (CDN URL vĩnh viễn)

Nếu poll timeout → trả về `resourceUrl` làm fallback.

## Auth

Client phải gửi App Bridge session token trong header:
```ts
const token = await shopify.idToken();
fetch("/app/upload", {
  headers: { Authorization: `Bearer ${token}` }
})
```

Cần thiết vì `unstable_newEmbeddedAuthStrategy` đã bị tắt — dùng traditional OAuth flow.

## Sử dụng

Dùng chung cho:
- Combination thumbnail
- Color image
- Tag image
