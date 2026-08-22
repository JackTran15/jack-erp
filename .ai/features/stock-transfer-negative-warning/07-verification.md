---
feature: stock-transfer-negative-warning
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Phiếu chuyển kho: cho phép chuyển quá tồn (kho xuất âm)

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Thanh công cụ của hộp thoại "Thêm mới phiếu chuyển kho" không còn nút "Thêm mới" | `/inventory/stock-transfers` | `click button:has-text("Thêm mới"); wait text=Thêm mới phiếu chuyển kho; click button[aria-label="Phóng to"]` | AC-03 | count [role="dialog"] button:has-text("Thêm mới") = 0; count [role="dialog"] button:has-text("Đóng") = 1; count button:has-text("Thêm mới") = 1 |
| S2 | Lưu phiếu chuyển 10 đôi `ABA2777-D-43` từ `Kho Lưu trữ HCM` (tồn 3): hiện cảnh báo xuất quá tồn thay vì lỗi chặn | `/inventory/stock-transfers` | `click button:has-text("Thêm mới"); wait text=Thêm mới phiếu chuyển kho; click button[aria-label="Phóng to"]; click button:has-text("Chọn kho"); fill #transfer-source-select = Kho Lưu trữ HCM; click [role="option"]:has-text("Kho Lưu trữ HCM"); fill #transfer-dest-select = HCM - Showroom; click [role="option"]:has-text("HCM - Showroom"); click button:has-text("Đồng ý"); fill input[placeholder="Tìm mã/tên"] = ABA2777-D-43; click [role="option"]:has-text("ABA2777-D-43"); wait text=ABA2777-D-43; wait input[value="A10 · A10"]; fill input[aria-label="Số lượng"] = 10; click button:has-text("Lưu"); wait text=Xác nhận xuất quá số lượng tồn` | AC-01 | no-text=Không đủ tồn để chuyển; count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") tbody tr = 1; count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") tbody tr:has-text("ABA2777-D-43") td:text-is("3") = 1; count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") td:text-is("Kho Lưu trữ HCM") = 1; count [role="dialog"] button:has-text("Tiếp tục") = 1; count [role="dialog"] button:has-text("Không") = 1 |

| S3 | Bấm "Tiếp tục" trên cảnh báo: phiếu chuyển 9 đôi `VERIFY-NEG-XFER` từ `Kho Lưu trữ HCM` (tồn 2) được lưu và ghi sổ, hộp thoại đóng lại | `/inventory/stock-transfers` | `click button:has-text("Thêm mới"); wait text=Thêm mới phiếu chuyển kho; click button[aria-label="Phóng to"]; click button:has-text("Chọn kho"); fill #transfer-source-select = Kho Lưu trữ HCM; click [role="option"]:has-text("Kho Lưu trữ HCM"); fill #transfer-dest-select = HCM - Showroom; click [role="option"]:has-text("HCM - Showroom"); click button:has-text("Đồng ý"); fill input[placeholder="Tìm mã/tên"] = VERIFY-NEG-XFER; click [role="option"]:has-text("VERIFY-NEG-XFER"); wait text=VERIFY-NEG-XFER; wait input[value="A10 · A10"]; fill input[aria-label="Số lượng"] = 9; click button:has-text("Lưu"); wait text=Xác nhận xuất quá số lượng tồn; click button:has-text("Tiếp tục")` | AC-02 | no-text=Không đủ tồn để chuyển; no-text=Xác nhận xuất quá số lượng tồn; no-text=Thêm mới phiếu chuyển kho |
| S4 | Nguồn sự thật: sau S3, tồn `VERIFY-NEG-XFER` tại `Kho Lưu trữ HCM` là **-7** (2 - 9), và 9 đôi đã sang `HCM - Showroom` | `/inventory/item-location-details` | `fill input[placeholder="Giá trị..."] >> nth=1 = VERIFY-NEG-XFER; wait text=Hiển thị 1 - 2 trên 2 kết quả` | AC-02 | text=Hiển thị 1 - 2 trên 2 kết quả; count tbody tr:has-text("Kho Lưu trữ HCM") td:text-is("-7") = 1; count tbody tr:has-text("HCM - Showroom") td:text-is("9") = 1 |
| S5 | Phiếu **xuất kho**: xuất 10 đôi `ABA2777-D-43` từ `Kho Lưu trữ HCM` cũng cảnh báo, và báo đúng cùng số tồn 3 mà S2 báo trên phiếu chuyển kho | `/inventory/goods-issues` | `click [aria-label="Hành động trang"] button:has-text("Thêm mới"); wait text=Thêm mới phiếu xuất kho; fill [role="dialog"] input[placeholder="Tìm mã hoặc tên"] = ABA2777-D-43; click [data-lookup-popover] tr[role="option"]:has-text("ABA2777-D-43"); wait [role="dialog"] tr[data-row-index="0"] input[value="Kho Lưu trữ HCM"]; fill [role="dialog"] tr[data-row-index="0"] input[type="number"] = 10; click [role="dialog"] button:has-text("Lưu"); wait text=Xác nhận xuất quá số lượng tồn` | AC-04 | count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") tbody tr = 1; count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") tbody tr:has-text("ABA2777-D-43") td:text-is("3") = 1; count [role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn") td:text-is("Kho Lưu trữ HCM") = 1 |
| S6 | Hộp thoại "Chọn kho" của phiếu chuyển kho: cột **Mã kho** hiện `KLT`, không phải `—` | `/inventory/stock-transfers` | `click button:has-text("Thêm mới"); wait text=Thêm mới phiếu chuyển kho; click button:has-text("Chọn kho"); fill #transfer-source-select = Kho Lưu trữ HCM; wait [role="option"]:has-text("Kho Lưu trữ HCM")` | AC-05 | count [role="option"]:has-text("Kho Lưu trữ HCM") :text-is("KLT") = 1; count [role="option"]:has-text("Kho Lưu trữ HCM") :text-is("—") = 0 |
## Not verified here

Không có. Cả năm AC đều được chụp ở trên.

## Dữ liệu kiểm chứng

`ABA2777-D-43` (S2) là dữ liệu có sẵn và **chỉ được đọc** — S2 dừng ở hộp thoại cảnh báo, không
bấm "Tiếp tục", nên không có gì được ghi.

`VERIFY-NEG-XFER` (S3, S4) được seed riêng cho bước ghi, đúng theo lối của
`.ai/features/goods-issue-source-warehouse`: mã này không nằm trong bất kỳ luồng nghiệp vụ nào
nên số liệu của nó đứng yên, và S3 ghi vào nó chứ không vào tồn thật của ai.

```
 code            | kho             | vị trí  | SL trước S3 | SL sau S3
-----------------+-----------------+---------+-------------+-----------
 VERIFY-NEG-XFER | Kho Lưu trữ HCM | A10     |           2 |        -7
 VERIFY-NEG-XFER | HCM - Showroom  | DEFAULT |  (chưa có)  |         9
```

**S3 ghi thật và không tự phục hồi.** Sổ kho là bất biến nên mỗi lần chạy lại verify sẽ trừ thêm
9 nữa (-7 → -16) và assertion của S4 sẽ đỏ. Trước mỗi lần chạy lại, đưa fixture về trạng thái đầu:

```sql
UPDATE stock_balances SET quantity = 2, updated_at = now()
WHERE item_id = '00000000-0000-4000-8000-0000000f0001'
  AND location_id = '32113712-3665-4660-918a-acfbd9f485fd';   -- Kho Lưu trữ HCM / A10
DELETE FROM stock_balances
WHERE item_id = '00000000-0000-4000-8000-0000000f0001'
  AND location_id = '4cc7fc70-534d-4c45-a242-2017377fa644';   -- HCM - Showroom / DEFAULT
```

Phiếu chuyển kho và bút toán sổ do S3 sinh ra được để lại — xoá chúng đòi bút toán đảo, và chúng
không ảnh hưởng tới con số mà S4 khẳng định.

## Notes

Dữ liệu cố định của môi trường local (`erp_dev`, chi nhánh HCM) — nếu seed đổi thì assertion
phải đổi theo:

- `ABA2777-D-43` có tồn **3** tại `Kho Lưu trữ HCM` / kệ `A10`, và cũng được theo dõi ở
  `HCM - Showroom`. Chọn nó chứ không phải một mã tồn 0 là có chủ đích: mã có tồn thật ở cả hai
  đầu thì `resolveItemSources` / `getPreferredShelf` điền được Vị trí xuất `A10`, nên số 3 mà hộp
  thoại hiện đúng là tồn tại **vị trí** server sẽ trừ — không phải một con số gộp gần đúng.
- Số lượng 10 > 3 nên chênh lệch không thể do làm tròn hay do một dòng trắng lọt vào.

`no-text=Không đủ tồn để chuyển` là assertion mang nhiều thông tin nhất của cả file: đó chính là
câu lỗi mà build cũ ném ra ở đúng thời điểm này. Nếu bản sửa bị revert, S2 đỏ ngay tại dòng đó
chứ không phải đỏ vì "không tìm thấy hộp thoại" — hai nguyên nhân khác hẳn nhau khi đọc log.

`td:text-is("3")` chấm đúng ô "Số tồn" của dòng `ABA2777-D-43` trong hộp thoại cảnh báo, chứ
không phải chỉ khẳng định hộp thoại đã mở. Không có nó thì S2 vẫn xanh khi hộp thoại hiện sai số
tồn — tức đúng loại lỗi mà một ảnh chụp "trông có vẻ đúng" che mất. Ba assertion `count` đều
scope vào `[role="dialog"]:has-text("Xác nhận xuất quá số lượng tồn")`: hộp thoại cảnh báo là một
AppModal riêng, portal ra ngoài body cạnh hộp thoại phiếu, nên nó không lồng trong phiếu và
selector này không thể vô tình chấm phải bảng chi tiết của phiếu.

S1 khẳng định ba thứ chứ không phải một, vì `count … = 0` một mình là assertion tự-xanh: nó cũng
xanh khi hộp thoại chưa kịp mở. `count [role="dialog"] button:has-text("Đóng") = 1` chứng minh
thanh công cụ của hộp thoại đã render, và `count button:has-text("Thêm mới") = 1` chứng minh nút
"Thêm mới" của trang vẫn còn — tức thứ bị gỡ đúng là nút trong hộp thoại, không phải cả hai.

Chuỗi Interaction của S2 dài hơn mức ba hành động mà templates khuyến nghị và không tách được:
mỗi step tự `page.goto` lại từ đầu nên không thừa hưởng state của step trước, trong khi "Chọn
kho", thêm dòng hàng và sửa số lượng đều là điều kiện bắt buộc để cảnh báo có thể nổ ra.

`wait input[value="A10 · A10"]` đứng ngay trước mỗi lần điền Số lượng, không phải để chụp ảnh cho
đẹp: `resolveItemSourceBatch` / `getTransferPreferredShelfBatch` trả về sau khi dòng đã hiện và
ghi đè lại dòng đó, cuốn theo cả Số lượng vừa gõ. Lần chạy đầu S3 dính đúng bẫy này — phiếu lưu
ra 1 đôi thay vì 9, không đủ để vượt tồn nên cảnh báo không nổ và bước đỏ vì `wait` hết giờ. Chờ
Vị trí xuất hiện ra là chờ đúng cái request đó xong.

S6 khẳng định cả hai chiều trên cùng một dòng dropdown: `KLT` phải có **và** `—` phải không có.
Chỉ khẳng định vế đầu thì bước vẫn xanh nếu dialog render cả hai; chỉ khẳng định vế sau thì nó
xanh cả khi dropdown rỗng. `KLT` là mã thật của `Kho Lưu trữ HCM` trong `erp_dev`.
