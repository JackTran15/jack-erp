---
feature: product-no-variant-price-edit
slug: 2026091101-product-no-variant-price-edit
owner: Akenzy
created: 2026-09-11
status: approved
---

# Intent — Sửa giá hàng hoá không có biến thể

## Problem

Danh mục > Hàng hoá: mở **Sửa** một hàng hoá chỉ có 1 dòng, không có thuộc tính (Màu/Size),
người dùng **không thấy và không sửa được Giá mua / Giá bán**.

Nguyên nhân (đã đọc code): `InventoryItemCreateForm.tsx:757` chỉ render 2 ô
`purchasePrice` / `sellingPrice` khi `!isEdit`. Commit `1a407ae7` (2026-06-03) ẩn chúng ở màn
sửa với lý do "hàng có biến thể thì giá thực nằm ở từng biến thể" — đúng cho hàng có biến thể,
nhưng bảng "Danh sách phiên bản" chỉ hiện khi `variantRows.length > 0`. Hàng không có thuộc
tính rơi vào khe giữa: ô giá chung bị ẩn, bảng phiên bản cũng không có → không còn chỗ nào để
sửa giá.

Quy mô trên `erp_dev_3008` (bản dữ liệu local): 366 hàng lẻ (`items.product_id IS NULL`) và 1
product có đúng 1 item không thuộc tính (DD1500). Tất cả đều đi qua cùng form sửa này.

Backend đã sẵn sàng: `UpdateItemDto` nhận `purchasePrice`/`sellingPrice`; nhánh product
(`updateProductWithVariants` → `pickProductVariantSharedItemFields`) và nhánh hàng lẻ
(`super.update` → `stripDerivedFields` không bỏ giá) đều ghi giá xuống `items`.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| ------- | ----------------- | ----------------- |
| Quản trị danh mục hàng hoá (backoffice) | Mở Sửa hàng không biến thể → không có ô giá; muốn đổi giá phải xoá tạo lại hoặc nhờ kỹ thuật sửa DB | Mở Sửa → thấy Giá mua TB / Giá bán TB đã điền giá hiện tại, sửa và Lưu được |
| Thu ngân POS | Bán theo giá cũ vì danh mục không cập nhật được | Bán theo giá mới sau khi backoffice lưu, theo cơ chế làm mới danh mục POS hiện có (A-06) |

## Success signal

Trên backoffice local, mở Sửa một hàng lẻ và product DD1500 → đổi Giá mua TB + Giá bán TB →
Lưu → mở lại thấy giá mới, và `items.purchase_price` / `items.selling_price` trong DB khớp giá
mới. Hàng có biến thể mở Sửa vẫn không hiện ô giá chung (không đổi hành vi).

## Out of scope

- **Đơn giá nhập đầu kỳ / Tồn kho ban đầu** — gắn với bút toán tồn đầu trong sổ kho (bất biến sau
  khi ghi sổ); vẫn chỉ nhập khi thêm mới. Đã xác nhận "giá nhập" = Giá mua (Akenzy, 2026-09-11).
- **Đổi nhãn "Giá mua TB" / "Giá bán TB"** — giữ nguyên, khớp form Thêm mới và cột danh sách
  (Akenzy, 2026-09-11).
- **Hàng có biến thể** — giữ nguyên: ẩn ô giá chung, sửa giá tại bảng phiên bản (Akenzy,
  2026-09-11).
- **Backend / API / migration** — không đổi; backend đã nhận và ghi giá ở cả hai nhánh cập nhật.
- **Lỗi tiềm ẩn có sẵn**: khi sửa product có biến thể, payload luôn mang `purchasePrice` của item
  đại diện → `sharedPatch` ghi đè giá mọi biến thể, rồi `updateExistingVariantRowsFromPayload`
  ghi lại theo bảng. Nếu người dùng xoá hết Màu/Size, `variants` rỗng và giá mọi biến thể bị san
  phẳng về giá item đại diện. Có từ trước, không do feature này gây ra — chỉ ghi nhận, không sửa.
- Chỉnh giá hàng loạt / sửa giá inline ngay trên lưới danh sách.

## Constraints

| Kind | Detail |
| ---- | ------ |
| Platform | `@erp/backoffice-web` không có test runner (`"test": "echo test"`) — kiểm chứng UI bằng `tsc` + trình duyệt (ai-dlc-verify, env `local-backoffice`) |
| Convention | UI tiếng Việt; import primitive từ `@erp/ui`; sửa tối thiểu, không refactor form 1.4k dòng |
| Data | `items.purchase_price` / `selling_price` là `numeric(18,2) NOT NULL DEFAULT 0` (information_schema, `erp_dev_3008`) — ô giá để trống không được lọt xuống DB dưới dạng `null` (ADR-03) |

## Existing surface touched

- Reused components: `InventoryItemCreateForm` (dùng chung cho `CrudCreatePage` và `CrudEditPage`),
  `renderDynamicField` → `CrudFieldInput` (money) → `MoneyInput` từ `@erp/ui`
- Adjacent features: commit `1a407ae7` (ẩn giá ở màn sửa); `pos-variant-stock-columns`
- Entry points: không route mới — `/admin/inventory-items/:id/edit` (`CrudEditPage`)
