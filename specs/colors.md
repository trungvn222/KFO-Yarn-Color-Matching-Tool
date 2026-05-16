# Colors

Route: `/app/colors`
File: `app/routes/app.colors.tsx`

## Mô tả

Quản lý danh sách màu sợi. Mỗi màu có thể biểu diễn bằng mã hex hoặc ảnh (cho các màu phức tạp như gradient, texture không thể hiện được bằng hex đơn thuần).

## Data model

```ts
interface KfoColor {
  objectID: string;   // = slug (auto từ name)
  name: string;
  hex: string;        // mã màu hex, vd "#FF5733"
  image_url?: string; // ảnh thay thế nếu hex không đủ
  description?: string;
}
```

## UI

### DataTable

| Cột | Nội dung |
|---|---|
| Color | Nếu có `image_url` → Thumbnail ảnh; nếu không → ô màu hex 40×40 + tên |
| Slug | `objectID` |
| Hex | mã hex |
| Actions | Edit / Delete |

### Modal Add/Edit

| Field | Type | Ghi chú |
|---|---|---|
| Name | TextField | Slug tự sinh từ name |
| Hex color | TextField | Prefix hiện ô màu preview |
| Description | TextField multiline (3 rows) | Mô tả màu |
| Image | Upload + Browse library | Optional, cho màu không biểu diễn được bằng hex |

## Behaviors

- **Slug**: tự sinh = `name.toLowerCase().replace(/\s+/g, "-")`
- **Image upload**: POST `/app/upload` với `Authorization: Bearer <idToken>`
- **Browse library**: GET `/app/upload` → modal grid ảnh đã upload
- **Loading state**: Spinner thay DataTable trong khi save/delete (chờ Algolia `waitForTask`)
- **Consistency**: dùng `waitForTask` sau mỗi write để đảm bảo data mới hiện ngay khi reload
