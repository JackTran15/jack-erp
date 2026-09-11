---
feature: product-no-variant-price-edit
adr_count: 3
---

# Logical design — Sửa giá hàng hoá không có biến thể

## Approach

Sửa một chỗ trong `InventoryItemCreateForm.tsx` (khối "Thông tin", hiện ở dòng 754-762 lúc lập kế
hoạch). Thay điều kiện `!isEdit` bằng một điều kiện phân biệt hàng có / không có biến thể:

```ts
const recordHasAttributes =
  isEdit &&
  ((Array.isArray(initialRecord?.colors) && initialRecord.colors.length > 0) ||
    (Array.isArray(initialRecord?.sizes) && initialRecord.sizes.length > 0));
// Mở theo items.id (hàng lẻ) → bản ghi không có key `variants` → 0.
// Mở theo products.id → `variants` có một dòng cho mỗi item, bất kể tên thuộc tính.
const recordItemCount = Array.isArray(initialRecord?.variants)
  ? initialRecord.variants.length
  : 0;
const showBasePrices =
  !isEdit ||
  (!recordHasAttributes && recordItemCount <= 1 && variantRows.length === 0);
```

- `showBasePrices` true → render `purchasePrice` / `sellingPrice` qua `renderDynamicField`, giữ
  tham số `disabled = variantRows.length > 0` như hiện tại (ở màn sửa, khi đã hiện thì luôn
  `false`; ở màn thêm mới thì y như cũ).
- Ở màn sửa, hai ô giá dùng `onValueChange` map `""` → `0` trước khi ghi vào `values` (ADR-03).
- Cập nhật comment tiếng Việt phía trên khối, và comment trong `renderRemainingFields` vốn nói
  hai field này "hidden on the edit/detail view".

Không đổi backend. Payload sửa vốn đã mang `purchasePrice` / `sellingPrice` (form hydrate
`values` bằng `{...record}`), nên hiện ô giá chỉ làm cho người dùng đổi được giá trị đang gửi.

## Alternatives rejected

| Option | Why not |
| ------ | ------- |
| Bỏ hẳn `!isEdit`, hiện ô giá ở mọi màn sửa, khoá khi có biến thể (giống form Thêm mới) | Hàng có biến thể ở màn sửa sẽ hiện thêm ô giá chung bị khoá — trái A-03 (giữ như hiện tại) |
| Chỉ dựa vào `variantRows.length === 0` | `variantRows` khởi tạo `[]` và chỉ được set trong `useEffect` → ô giá nháy hiện rồi ẩn khi mở hàng có biến thể; và xoá hết Màu/Size của hàng có biến thể làm lộ ô giá chung → Lưu ghi một giá xuống mọi biến thể qua `sharedPatch` (ADR-02) |
| Chỉ dựa vào `colors`/`sizes` của bản ghi + `variantRows` (bản đầu của ADR-02) | `loadProductAttributes` chỉ nhận thuộc tính tên `color`/`size`; product nhiều item có thuộc tính tên khác hoặc không có thuộc tính vẫn lộ ô giá chung (code review 2026-09-11) |
| Mở rộng `loadProductAttributes` nhận mọi tên thuộc tính | Bảng phiên bản của form chỉ hiểu Color/Size (key `color__size`, `autoVariantSku`) — đổi hợp đồng dữ liệu của cả form, phạm vi lớn hơn nhiều; không cần để chặn ô giá chung (A-08) |
| Hiển thị một bảng phiên bản 1 dòng cho hàng không biến thể | Bảng phiên bản gắn với combo Màu/Size và nhánh `updateExistingVariantRowsFromPayload` cần `itemId`; hàng lẻ không có `initialRecord.variants` → phải sửa backend. Nặng hơn nhiều cho cùng kết quả |
| Backend: ép `null` → 0 cho cột giá trong `update()` | Chạm service dùng chung của generic CRUD để chữa một giá trị do form sinh ra; form Thêm mới đã có ngữ nghĩa "trống = 0" ở phía client |
| Báo lỗi "bắt buộc" khi ô giá trống | Form Thêm mới cho để trống (= 0); thêm ràng buộc chỉ ở màn sửa là không nhất quán (A-04) |

## Contracts

Không đổi. Endpoint cập nhật generic CRUD hiện có (`useCrudUpdate("inventory-items")`), body do
`sanitizeCrudPayload(editableFields, values, "update")` dựng, mang `purchasePrice: number`,
`sellingPrice: number`. Hai nhánh backend đã có sẵn:

| `:id` là | Nhánh | Giá được ghi thế nào |
| -------- | ----- | -------------------- |
| `products.id` (`AAA-AIDLC-SINGLE`) | `update` → `hasProductLevelPatch` → `updateProductWithVariants` | `pickProductVariantSharedItemFields` → `UPDATE items … WHERE product_id = :id` — ghi xuống **mọi** item của product, nên chỉ được mở ô giá khi product có tối đa một item (ADR-02). Đã có test `item-crud-variants.service.spec.ts:330` |
| `items.id` (hàng lẻ) | `update` → `super.update` → `beforeUpdate` → `stripDerivedFields` | Giá đi thẳng vào cập nhật `items`; `stripDerivedFields` không bỏ giá — khoá bằng T-01-02 |

Bản ghi nạp cho màn sửa (`getById`): theo `items.id` → không có key `variants`; theo `products.id`
→ `getRepresentativeItemForProduct` gắn `variants = loadProductVariants(...)`, một dòng mỗi item
(`GROUP BY i.id`), và `colors`/`sizes` chỉ từ thuộc tính tên Color/Size.

## State ownership

| State | Owner | Lifetime |
| ----- | ----- | -------- |
| `values.purchasePrice` / `values.sellingPrice` | `CrudEditPage` (`useState`, hydrate từ `record`) | Màn sửa |
| `variantRows` | `InventoryItemCreateForm` (`useState`, sinh từ `values.colors/sizes`) | Màn sửa |
| `recordHasAttributes`, `recordItemCount` | Suy ra từ prop `initialRecord` mỗi lần render, không lưu state | Render |

## Error taxonomy

| Condition | Handling | UI |
| --------- | -------- | -- |
| Người dùng xoá trống ô giá ở màn sửa | `onValueChange` map `""` → `0`; `null` không bao giờ tới cột `NOT NULL` | Ô hiện 0; Lưu ghi 0 |
| API cập nhật lỗi (4xx/5xx, mất mạng) | Có sẵn: `CrudEditPage.handleSubmit` bắt lỗi → `getUserFacingApiErrorMessage` | Toast lỗi; form giữ nguyên giá vừa nhập |
| Bản ghi có Màu/Size | `recordHasAttributes` true | Không render ô giá chung (không nháy) |
| Product ≥2 item mà không nhận ra Color/Size (thuộc tính tên khác, hoặc không có thuộc tính) | `recordItemCount > 1` | Không render ô giá chung |
| Người dùng xoá hết Màu/Size của hàng có biến thể | `recordHasAttributes` vẫn true | Ô giá chung vẫn ẩn |
| Người dùng nhập Màu/Size cho hàng không biến thể | `variantRows.length > 0` | Ô giá chung ẩn, bảng phiên bản hiện |

## Observability

Không thêm log hay metric. Lưu giá thành công/thất bại đã hiện qua toast có sẵn; lỗi phía API đi
qua logging HTTP hiện có.

## ADRs

### ADR-01 — Chỉ sửa frontend; backend giữ nguyên
**Context:** `UpdateItemDto` đã có `purchasePrice`/`sellingPrice`; cả nhánh product
(`pickProductVariantSharedItemFields`) lẫn nhánh hàng lẻ (`super.update`, `stripDerivedFields`
không bỏ giá) đều ghi giá. Lỗi chỉ nằm ở chỗ form không render ô giá khi `isEdit`.
**Decision:** Không đổi API, DTO, service hay migration. Chỉ thêm một unit test backend (T-01-02)
khoá hành vi mà bản sửa phụ thuộc vào ở nhánh hàng lẻ.
**Consequences:** Diff production chỉ một file. Giá trị trống phải được chặn ở form (ADR-03).
Nếu sau này ai đó thêm giá vào `stripDerivedFields`, T-01-02 sẽ đỏ.
**Status:** accepted — Akenzy, 2026-09-11, qua AskUserQuestion: "Duyệt, pass rồi code luôn"

### ADR-02 — "Không có biến thể" = bản ghi có tối đa một item, không có Màu/Size, VÀ form không có dòng phiên bản
**Context:** `variantRows` bắt đầu rỗng và chỉ được sinh trong `useEffect` sau khi `values`
được hydrate, nên dựa riêng vào nó sẽ làm ô giá nháy lên với hàng có biến thể và lộ ra khi người
dùng xoá hết Màu/Size. `CrudEditPage` chỉ mount form khi `record` đã tải xong, nên `initialRecord`
có ngay ở render đầu.

Bản đầu của ADR này (accepted 2026-09-11) chỉ xét `colors`/`sizes` của bản ghi. Code review
T-01-01 cùng ngày chỉ ra lỗ hổng, đã kiểm lại bằng code: `loadProductAttributes` chỉ nhận thuộc
tính tên `color`/`size` (item-crud.service.ts:1196), còn `loadProductVariants` trả một dòng cho mỗi
item bất kể tên thuộc tính (`GROUP BY i.id`, :1540). Product nhiều item có thuộc tính đặt tên khác
(theo code review, trang Sản phẩm cho đặt tên tự do) hoặc không có thuộc tính sẽ có `colors`/`sizes`
rỗng và `variantRows` rỗng → ô giá chung lộ ra, Lưu ghi một giá xuống mọi item qua `sharedPatch`.
Dữ liệu local hiện chỉ có tên Color/Size và 0 product như vậy (`erp_dev_3008`, `erp_dev`), nhưng
đường code tồn tại và prod chưa kiểm.
**Decision:**
`showBasePrices = !isEdit || (!recordHasAttributes && recordItemCount <= 1 && variantRows.length === 0)`,
với `recordItemCount = initialRecord.variants.length` khi có mảng `variants`, ngược lại 0 (hàng lẻ mở
theo `items.id` không có key này).
**Consequences:** Hàng có biến thể không bao giờ thấy ô giá chung ở màn sửa — dù nhận diện được
Màu/Size hay không, kể cả khi xoá hết Màu/Size. Hàng lẻ (0) và product một item (1) vẫn sửa được
giá. Hàng không biến thể mà người dùng thêm Màu/Size thì ô giá chung ẩn — đúng A-03. Form Thêm mới
không bị ảnh hưởng vì `!isEdit` luôn true. A-07 không còn là giả định thiết kế phải dựa vào. Product
có thuộc tính tên khác vẫn không có chỗ sửa giá từng item trong form này (có từ trước, A-08).
**Status:** accepted — sửa đổi 2026-09-11 sau code review T-01-01; Akenzy duyệt lại qua AskUserQuestion: "Duyệt, pass lại và sửa code"

### ADR-03 — Ô giá trống ở màn sửa được lưu là 0, xử lý tại form
**Context:** `items.purchase_price` / `selling_price` là `NOT NULL DEFAULT 0`. `MoneyInput` gọi
`onChange("")` khi xoá trống; `sanitizeCrudPayload` ở chế độ `update` đổi giá trị trống của field
`number` thành `null`; backend `normalizePayload` chỉ đổi `""` chứ không đổi `null` → lỗi NOT NULL.
Form Thêm mới không gặp vì chế độ `create` bỏ hẳn key và cột dùng default 0.
**Decision:** Ở màn sửa, `onValueChange` của hai ô giá map `""` → `0`.
**Consequences:** Ngữ nghĩa khớp form Thêm mới (trống = 0). Khi xoá sạch, ô hiện ngay "0" thay
vì để trống. Không chạm `sanitizeCrudPayload` (dùng chung mọi entity) và không chạm backend.
**Status:** accepted — Akenzy, 2026-09-11, qua AskUserQuestion: "Duyệt, pass rồi code luôn"
