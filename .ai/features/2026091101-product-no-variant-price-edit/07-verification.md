---
feature: 2026091101-product-no-variant-price-edit
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Sửa giá hàng hoá không có biến thể

Chạy trên `erp_dev_3008` (DB mà API local đang dùng), tổ chức **My Company**
(`f1000000-0000-4000-8000-000000000001`). Path dùng id bản ghi fixture, không dùng id tổ chức:

| Mã | Hình dạng | Id trong Path | Giá gốc (mua / bán) |
|---|---|---|---|
| `AAA-AIDLC-ORPHAN` | Hàng lẻ: `product_id IS NULL`, không thuộc tính | item `11111111-0000-4000-8000-00000000aa01` | 100.000 / 190.000 |
| `AAA-AIDLC-SINGLE` | Product một item, không thuộc tính — seed 2026-09-11 cho feature này | product `11111111-0000-4000-8000-00000000ab03` | 300.000 / 450.000 |
| `AAA-AIDLC-MULTI` | Product hai item (`-1`, `-2`), không thuộc tính — seed 2026-09-11 cho AC-09 | product `11111111-0000-4000-8000-00000000ab04` | 500.000 / 700.000 và 520.000 / 720.000 |
| `A02-TEST` (mã product `A02`) | Product 6 phiên bản: Màu D, X × Size 39, 40, 41 | product `8c404f7e-a395-4883-9dbe-44d8cb9c029d` | — |

Các bước chạy theo thứ tự và có ghi dữ liệu: S2, S5, S9 đổi giá; S7, S11 trả về giá gốc. Mỗi bước
chờ `#create-code` mang mã của bản ghi trước khi thao tác, vì `CrudEditPage` mount form với
`values` rỗng rồi mới hydrate trong effect — `fill` sớm hơn sẽ bị hydrate ghi đè.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Hàng lẻ: màn sửa hiện Giá mua TB / Giá bán TB đã điền giá hiện tại, sửa được; ô tồn đầu vẫn khoá | `/admin/inventory-items/11111111-0000-4000-8000-00000000aa01/edit` | `wait #create-code[value="AAA-AIDLC-ORPHAN"]` | AC-01 | count #create-purchasePrice[value="100.000"] = 1;count #create-sellingPrice[value="190.000"] = 1;count #create-purchasePrice:disabled = 0;count #extra-initial-stock:disabled = 1;count #extra-initial-stock-price:disabled = 1 |
| S2 | Hàng lẻ: đổi hai giá rồi Lưu thành công | `/admin/inventory-items/11111111-0000-4000-8000-00000000aa01/edit` | `wait #create-code[value="AAA-AIDLC-ORPHAN"]; fill #create-purchasePrice = 110000; fill #create-sellingPrice = 200000; click text="Lưu"; wait [data-sonner-toast]` | AC-02 | text=Đã cập nhật |
| S3 | Hàng lẻ: mở lại Sửa thấy giá mới đã lưu | `/admin/inventory-items/11111111-0000-4000-8000-00000000aa01/edit` | `wait #create-code[value="AAA-AIDLC-ORPHAN"]` | AC-02 | count #create-purchasePrice[value="110.000"] = 1;count #create-sellingPrice[value="200.000"] = 1 |
| S4 | Hàng lẻ: ô Giá mua không còn chữ số nào thì hiện 0 | `/admin/inventory-items/11111111-0000-4000-8000-00000000aa01/edit` | `wait #create-code[value="AAA-AIDLC-ORPHAN"]; fill #create-purchasePrice = abc` | AC-04 | count #create-purchasePrice[value="0"] = 1 |
| S5 | Hàng lẻ: Lưu với ô Giá mua trống thành công, không lỗi hệ thống | `/admin/inventory-items/11111111-0000-4000-8000-00000000aa01/edit` | `wait #create-code[value="AAA-AIDLC-ORPHAN"]; fill #create-purchasePrice = abc; click text="Lưu"; wait [data-sonner-toast]` | AC-04 | text=Đã cập nhật |
| S6 | Hàng lẻ: mở lại thấy Giá mua đã lưu là 0 | `/admin/inventory-items/11111111-0000-4000-8000-00000000aa01/edit` | `wait #create-code[value="AAA-AIDLC-ORPHAN"]` | AC-04 | count #create-purchasePrice[value="0"] = 1;count #create-sellingPrice[value="200.000"] = 1 |
| S7 | Hàng lẻ: trả về giá gốc | `/admin/inventory-items/11111111-0000-4000-8000-00000000aa01/edit` | `wait #create-code[value="AAA-AIDLC-ORPHAN"]; fill #create-purchasePrice = 100000; fill #create-sellingPrice = 190000; click text="Lưu"; wait [data-sonner-toast]` | AC-02 | text=Đã cập nhật |
| S8 | Product một dòng: màn sửa hiện hai ô giá đã điền giá hiện tại, sửa được | `/admin/inventory-items/11111111-0000-4000-8000-00000000ab03/edit` | `wait #create-code[value="AAA-AIDLC-SINGLE"]` | AC-03 | count #create-purchasePrice[value="300.000"] = 1;count #create-sellingPrice[value="450.000"] = 1;count #create-sellingPrice:disabled = 0 |
| S9 | Product một dòng: đổi Giá bán rồi Lưu thành công | `/admin/inventory-items/11111111-0000-4000-8000-00000000ab03/edit` | `wait #create-code[value="AAA-AIDLC-SINGLE"]; fill #create-sellingPrice = 480000; click text="Lưu"; wait [data-sonner-toast]` | AC-03 | text=Đã cập nhật |
| S10 | Product một dòng: mở lại thấy Giá bán mới, Giá mua giữ nguyên | `/admin/inventory-items/11111111-0000-4000-8000-00000000ab03/edit` | `wait #create-code[value="AAA-AIDLC-SINGLE"]` | AC-03 | count #create-sellingPrice[value="480.000"] = 1;count #create-purchasePrice[value="300.000"] = 1 |
| S11 | Product một dòng: trả về giá gốc | `/admin/inventory-items/11111111-0000-4000-8000-00000000ab03/edit` | `wait #create-code[value="AAA-AIDLC-SINGLE"]; fill #create-sellingPrice = 450000; click text="Lưu"; wait [data-sonner-toast]` | AC-03 | text=Đã cập nhật |
| S12 | Hàng có biến thể: không có ô giá chung, bảng phiên bản đủ 6 dòng | `/admin/inventory-items/8c404f7e-a395-4883-9dbe-44d8cb9c029d/edit` | `wait text=Danh sách phiên bản` | AC-05 | count #create-purchasePrice = 0;count #create-sellingPrice = 0;count button[aria-label="Xóa biến thể"] = 6 |
| S13 | Hàng có biến thể: xoá hết thẻ Màu/Size, ô giá chung vẫn không hiện (không Lưu) | `/admin/inventory-items/8c404f7e-a395-4883-9dbe-44d8cb9c029d/edit` | `wait text=Danh sách phiên bản; click [aria-label="Xóa D"]; click [aria-label="Xóa X"]; click [aria-label="Xóa 39"]; click [aria-label="Xóa 40"]; click [aria-label="Xóa 41"]` | AC-06 | no-text=Danh sách phiên bản;count #create-purchasePrice = 0;count #create-sellingPrice = 0 |
| S14 | Thêm mới: hai ô giá hiện và sửa được | `/admin/inventory-items/new` | `wait #create-purchasePrice` | AC-08 | count #create-purchasePrice = 1;count #create-sellingPrice = 1;count #create-purchasePrice:disabled = 0 |
| S15 | Product hai item không thuộc tính: không có ô giá chung (không Lưu) | `/admin/inventory-items/11111111-0000-4000-8000-00000000ab04/edit` | `wait #create-code[value="AAA-AIDLC-MULTI"]` | AC-09 | count #create-purchasePrice = 0;count #create-sellingPrice = 0 |

## Not verified here

- **AC-07** (đang sửa hàng không biến thể, nhập Màu → ô giá chung ẩn): `TagsInput` chỉ thêm thẻ
  khi nhận phím Enter (`packages/ui/src/components/tags-input.tsx:38`), còn runner chỉ có
  `click`/`fill`/`wait`/`scroll` — `fill` không bắn `keydown`. Kiểm tay trên trình duyệt ở G4, kết
  quả ghi vào `## Notes`.

Chỉ nêu ở mục này mã của tiêu chí hoàn toàn không có bước tự động: `evidence_check.py` coi mọi mã
tiêu chí xuất hiện trong mục này là ngoài phạm vi trình duyệt và bỏ qua kiểm tra độ phủ của nó.

## Notes

- Có bước tự động nhưng chưa phủ trọn, kiểm thêm ngoài runner và ghi kết quả vào đây: nửa sau của
  AC-08 (form Thêm mới, nhập Màu → hai ô giá bị khoá — cùng lý do phím Enter; S14 chỉ phủ nửa
  đầu), và vế "DB khớp" của AC-02, AC-03, AC-04 (S2–S11 chứng minh qua UI; đối chiếu bằng SQL sau
  khi chạy).
- S4/S5 dùng `fill … = abc` thay cho xoá trống: parser của runner không nhận `fill` có giá trị
  rỗng, và `MoneyInput` gọi `onChange("")` cho mọi chuỗi không có chữ số
  (`parseMoneyIntegerString` trả `null`) — cùng nhánh với khi người dùng xoá sạch ô, tức đúng
  nhánh ADR-03 cần chứng minh.
- Assert dạng `[value="…"]` dựa vào việc React đồng bộ thuộc tính `value` của input có kiểm soát.
- S15 đỏ trên bản code trước code review (chỉ xét `colors`/`sizes`) — đó là lỗ hổng ADR-02 sửa đổi
  chặn lại.
- Nếu một lần chạy dừng giữa S2 và S7 (hoặc S9 và S11), giá fixture không còn là giá gốc và S1/S8
  của lần chạy sau sẽ đỏ. Trả lại trước khi chạy lại:
  `docker exec erp-postgres psql -U erp_user -d erp_dev_3008 -c "UPDATE items SET purchase_price = 100000, selling_price = 190000 WHERE id = '11111111-0000-4000-8000-00000000aa01'; UPDATE items SET purchase_price = 300000, selling_price = 450000 WHERE id = '11111111-0000-4000-8000-00000000aa03'"`.
