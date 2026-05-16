# Combinations

Routes:
- List/Delete: `/app` → `app/routes/app._index.tsx`
- New: `/app/combinations/new` → `app/routes/app.combinations.new.tsx`
- Edit: `/app/combinations/:id/edit` → `app/routes/app.combinations.$id.edit.tsx`

Component: `app/components/CombinationForm.tsx`

## Mô tả

Tổ hợp màu sợi len gồm nhiều sản phẩm, được gắn màu và nhãn để merchant dùng làm gợi ý phối màu cho khách hàng.

## Data model

```ts
interface KfoCombination {
  objectID: string;   // UUID
  name: string;
  description?: string;
  image_url: string;  // thumbnail
  position: number;   // thứ tự hiển thị
  tags: string[];     // mảng tag slug
  colors: string[];   // mảng color objectID
  products: KfoProduct[];
}

interface KfoProduct {
  variant_id: string;
  product_name: string;
  handle: string;
  position: number;
  image_url?: string;
}
```

## UI — List page (`/app`)

- DataTable: Image / Name / Products / Tags / Actions (Edit, Delete)
- Filter theo tag (ChoiceList)
- **Loading state**: Spinner thay DataTable khi đang filter hoặc delete
- Empty state khi chưa có combination nào

## UI — Form (New / Edit)

### Layout

2 cột: main (2/3) + sidebar (1/3)

### Main column

| Section | Fields |
|---|---|
| Info card | Name + nút Auto-name, Description (multiline 3), Display position (number) |
| Products card | Danh sách sản phẩm đã chọn + nút "Add product" |

### Sidebar (có spacing `gap="400"` giữa các card)

| Card | Nội dung |
|---|---|
| Thumbnail | Preview ảnh, nút Upload + Browse library + Remove |
| Colors | Multi-select màu dạng pill (hex swatch + tên), selected hiện dạng Tag |
| Tags | Multi-select tag dạng Badge, selected hiện dạng Tag |

## Behaviors

### Products
- Chọn sản phẩm qua Shopify Resource Picker (`shopify.resourcePicker({ type: "product", multiple: true })`)
- Mỗi variant của product thêm thành 1 ProductRow riêng
- Có thể reorder (↑ ↓) và xóa từng product
- `position` tự cập nhật theo thứ tự trong danh sách

### Thumbnail
- Upload ảnh mới: POST `/app/upload`
- Browse library: GET `/app/upload` → modal grid ảnh đã upload trên Shopify Files
- Preview hiện trước các nút action

### Colors
- Hiện toàn bộ colors từ Algolia dưới dạng pill có màu hex
- Click để toggle chọn/bỏ
- Selected colors hiện dưới dạng Tag có thể remove

### Tags
- Hiện toàn bộ tags từ Algolia dưới dạng Badge
- Click để toggle chọn/bỏ
- Selected tags hiện dưới dạng Tag có thể remove

### Auto-name
- Nút "Auto-name" ghép `product_name` các sản phẩm thành tên combination

### Save
- Submit JSON `{ name, description, image_url, position, tags, colors, products }` via POST
- Redirect về `/app` sau khi lưu
