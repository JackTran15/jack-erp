---
feature: overstock-warning-edit-credit
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Sửa phiếu đã ghi sổ không còn bị cảnh báo "xuất quá số lượng tồn"

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Phiếu **xuất kho** `XK000012` đã xuất hết tồn `VERIFY-OVERSTOCK-EDIT` (tồn còn 0): Sửa rồi Lưu, không đổi gì — lưu thẳng, không cảnh báo | `/inventory/goods-issues` | `fill input[placeholder="Giá trị..."] >> nth=0 = XK000012; wait button:has-text("XK000012"); click button:has-text("XK000012"); wait [role="dialog"] button:has-text("Sửa"); click [role="dialog"] button:has-text("Sửa"); click [role="dialog"] button:has-text("Lưu")` | AC-01 | no-text=Xác nhận xuất quá số lượng tồn; text=Đã cập nhật phiếu xuất kho |
| S2 | Cùng phiếu `XK000012`, nâng số lượng 4 → 6: cảnh báo **vẫn hiện**, và "Số tồn" là **4** — tồn hiệu dụng (0 hiện có + 4 phiếu cũ trả lại), không phải 0 | `/inventory/goods-issues` | `fill input[placeholder="Giá trị..."] >> nth=0 = XK000012; wait button:has-text("XK000012"); click button:has-text("XK000012"); wait [role="dialog"] button:has-text("Sửa"); click [role="dialog"] button:has-text("Sửa"); fill [role="dialog"] tr[data-row-index="0"] input[type="number"] = 6; click [role="dialog"] button:has-text("Lưu"); wait text=Xác nhận xuất quá số lượng tồn` | AC-02 | count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") tbody tr = 1; count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") tbody tr:has-text("VERIFY-OVERSTOCK-EDIT") td:text-is("4") = 1; count [role="dialog"] button:has-text("Tiếp tục") = 1; count [role="dialog"] button:has-text("Không") = 1 |
| S3 | Phiếu **chuyển kho** `CK000014` đã chuyển hết tồn `VERIFY-OVERSTOCK-XFER` khỏi `Kho Lưu trữ HCM` (tồn còn 0): Sửa rồi Lưu, không đổi gì — lưu thẳng, không cảnh báo | `/inventory/stock-transfers` | `fill input[placeholder="Giá trị..."] >> nth=0 = CK000014; wait button:has-text("CK000014"); click tbody tr:has-text("CK000014") input[type="checkbox"]; click [aria-label="Hành động trang"] button:has-text("Sửa"); wait [role="dialog"] button:has-text("Lưu"); click [role="dialog"] button:has-text("Lưu")` | AC-03 | no-text=Xác nhận xuất quá số lượng tồn; text=Đã cập nhật phiếu chuyển kho |
| S4 | Cùng phiếu `CK000014`, nâng số lượng 4 → 6: cảnh báo **vẫn hiện**, "Số tồn" là **4** và "Kho xuất" là `Kho Lưu trữ HCM` | `/inventory/stock-transfers` | `fill input[placeholder="Giá trị..."] >> nth=0 = CK000014; wait button:has-text("CK000014"); click tbody tr:has-text("CK000014") input[type="checkbox"]; click [aria-label="Hành động trang"] button:has-text("Sửa"); wait [role="dialog"] input[aria-label="Số lượng"]; fill [role="dialog"] input[aria-label="Số lượng"] = 6; click [role="dialog"] button:has-text("Lưu"); wait text=Xác nhận xuất quá số lượng tồn` | AC-03 | count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") tbody tr = 1; count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") tbody tr:has-text("VERIFY-OVERSTOCK-XFER") td:text-is("4") = 1; count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") td:text-is("Kho Lưu trữ HCM") = 1 |

## Not verified here

Trường hợp biên **lẫn phạm vi** trong cùng một phiếu chuyển kho: hai dòng cùng mã cùng kho xuất,
một dòng đã chọn Vị trí còn dòng kia chưa. Khi đó credit được cộng cho cả khoá vị trí lẫn khoá kho
nên tồn hiệu dụng bị tính dư và cảnh báo có thể không hiện. Đã biết, chưa sửa, chưa chụp.

## Dữ liệu kiểm chứng

Hai mã riêng cho verify, không nằm trong bất kỳ luồng nghiệp vụ nào, nên số liệu của chúng đứng yên
giữa các lần chạy:

```
 code                  | kho             | vị trí | tồn trước phiếu | tồn sau phiếu
-----------------------+-----------------+--------+-----------------+---------------
 VERIFY-OVERSTOCK-EDIT | Kho Lưu trữ HCM | A10    |               4 |             0   (XK000012 xuất 4)
 VERIFY-OVERSTOCK-XFER | Kho Lưu trữ HCM | A10    |               4 |             0   (CK000014 chuyển 4 sang Showroom BMT)
```

**S1 và S3 ghi thật nhưng tồn không đổi** — số lượng giữ nguyên nên delta bằng 0; chỉ `revision` của
phiếu tăng. Chạy lại bao nhiêu lần cũng ra cùng kết quả, không cần reset.

**S2 và S4 không ghi gì** — cả hai dừng ở hộp thoại cảnh báo và không bấm "Tiếp tục".

Seed lại từ đầu (chỉ cần khi `erp_dev` bị dựng lại):

```sql
INSERT INTO items (id, organization_id, branch_id, created_by, code, name, unit, selling_price, purchase_price)
VALUES
 ('00000000-0000-4000-8000-0000000f0002','f1000000-0000-4000-8000-000000000001','69982b87-3fda-47ae-aa27-9ad947917de6','f1000000-0000-4000-8000-000000000031','VERIFY-OVERSTOCK-EDIT','Verify sua phieu xuat het ton VERIFY-OVERSTOCK-EDIT','Cái',750000,350000),
 ('00000000-0000-4000-8000-0000000f0003','f1000000-0000-4000-8000-000000000001','69982b87-3fda-47ae-aa27-9ad947917de6','f1000000-0000-4000-8000-000000000031','VERIFY-OVERSTOCK-XFER','Verify sua phieu chuyen het ton VERIFY-OVERSTOCK-XFER','Cái',750000,350000)
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO stock_balances (organization_id, branch_id, created_by, item_id, location_id, quantity)
VALUES
 ('f1000000-0000-4000-8000-000000000001','69982b87-3fda-47ae-aa27-9ad947917de6','f1000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-0000000f0002','32113712-3665-4660-918a-acfbd9f485fd',4),
 ('f1000000-0000-4000-8000-000000000001','69982b87-3fda-47ae-aa27-9ad947917de6','f1000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-0000000f0003','32113712-3665-4660-918a-acfbd9f485fd',4)
ON CONFLICT (organization_id, item_id, location_id) DO UPDATE SET quantity = 4, updated_at = now();
```

rồi lập hai phiếu qua API (chi nhánh HCM `69982b87-3fda-47ae-aa27-9ad947917de6`): một phiếu xuất kho
4 cái `VERIFY-OVERSTOCK-EDIT` từ vị trí `A10`, và một phiếu chuyển kho 4 cái `VERIFY-OVERSTOCK-XFER`
từ `Kho Lưu trữ HCM` sang `Showroom BMT`. Số phiếu sinh ra thay `XK000012` / `CK000014` trong bảng trên.

## Notes

Dữ liệu cố định của môi trường local (`erp_dev`, chi nhánh HCM):

- `Kho Lưu trữ HCM` = storage `46435ed6-f12b-49e5-a779-94cb4f0eee55`, vị trí `A10` = `32113712-3665-4660-918a-acfbd9f485fd`.
- `Showroom BMT` = storage `32a11ab4-0f55-4b6c-89a7-cae7b1372e9e`.
