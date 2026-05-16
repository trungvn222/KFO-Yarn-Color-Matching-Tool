# Tags

Route: `/app/tags`
File: `app/routes/app.tags.tsx`

## Mô tả

Quản lý danh sách nhãn (tags) để phân loại combinations. Mỗi tag có màu badge riêng và có thể có ảnh đại diện.

## Data model

```ts
interface KfoTag {
  objectID: string;    // = slug
  name: string;
  slug: string;        // = objectID
  color: string;       // hex màu badge, vd "#FFF9C4"
  image_url?: string;
  description?: string;
}
```

## UI

### DataTable

| Cột | Nội dung |
|---|---|
| Tag | Nếu có `image_url` → Thumbnail + tên; nếu không → badge màu với tên |
| Slug | slug |
| Color | mã hex |
| Actions | Edit / Delete |

### Modal Add/Edit

| Field | Type | Ghi chú |
|---|---|---|
| Name | TextField | Slug tự sinh từ name |
| Badge color | TextField | Prefix hiện ô màu preview |
| Description | TextField multiline (3 rows) | |
| Image | Upload + Browse library | Optional |

## Behaviors

- **Slug**: tự sinh = `name.toLowerCase().replace(/\s+/g, "-")`, cũng là `objectID`
- **Image upload**: POST `/app/upload` với `Authorization: Bearer <idToken>`
- **Browse library**: GET `/app/upload` → modal grid ảnh đã upload
- **Loading state**: Spinner thay DataTable trong khi save/delete
- **Consistency**: `waitForTask` sau mỗi write
