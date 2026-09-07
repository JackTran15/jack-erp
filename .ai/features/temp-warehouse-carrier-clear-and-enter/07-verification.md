---
feature: temp-warehouse-carrier-clear-and-enter
environments: [local-pos]
viewports: [desktop]
---

# Verification — Chuyển kho tạm: ô Người vận chuyển clear sau khi Thêm, ENTER chọn nhanh

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Thêm dòng xong: cả ô Người vận chuyển lẫn ô Hàng hóa trống trở lại, con trỏ nằm trong ô Người vận chuyển nên danh sách của nó tự mở | `/pos/fast-stock-transfer` | `fill input[aria-label="Người vận chuyển"] = NV000004; click [role="option"]:has-text("NV Kho HCM"); fill input[aria-label="Hàng hóa"] = ABA2777-D-39; click [role="option"]:has-text("ABA2777-D-39"); wait input[aria-label="Người vận chuyển"][value=""]` | AC-01 | count input[aria-label="Người vận chuyển"][value=""] = 1; count input[aria-label="Hàng hóa"][value=""] = 1; count [role="listbox"] = 1 |
| S2 | ENTER sau khi gõ đúng mã nhân viên: chọn được người đó dù danh sách chưa nổi dòng nào | `/pos/fast-stock-transfer` | `fill input[aria-label="Người vận chuyển"] = NV000004; press input[aria-label="Người vận chuyển"] = Enter; wait input[aria-label="Người vận chuyển"][value="NV Kho HCM"]` | AC-02 | count input[aria-label="Người vận chuyển"][value="NV Kho HCM"] = 1 |
| S3 | ENTER khi gõ một phần và chỉ còn đúng một kết quả: chọn luôn kết quả đó | `/pos/fast-stock-transfer` | `fill input[aria-label="Người vận chuyển"] = NhanVienB; press input[aria-label="Người vận chuyển"] = Enter; wait input[aria-label="Người vận chuyển"][value="NhanVienBH"]` | AC-02 | count input[aria-label="Người vận chuyển"][value="NhanVienBH"] = 1 |
| S4 | ENTER khi còn nhiều hơn một kết quả: không tự chọn, chuỗi vừa gõ và danh sách giữ nguyên | `/pos/fast-stock-transfer` | `fill input[aria-label="Người vận chuyển"] = Nhan; press input[aria-label="Người vận chuyển"] = Enter; wait [role="option"]` | AC-03 | count input[aria-label="Người vận chuyển"][value="Nhan"] = 1; count [role="option"] = 2 |
| S5 | ENTER trong ô Người vận chuyển inline khi sửa dòng: cùng quy tắc, cùng kết quả | `/pos/fast-stock-transfer` | `click button:has-text("Sửa"); fill tbody input[aria-label="Người vận chuyển"] = NV000004; press tbody input[aria-label="Người vận chuyển"] = Enter; wait tbody input[aria-label="Người vận chuyển"][value="NV Kho HCM"]` | AC-04 | count tbody input[aria-label="Người vận chuyển"][value="NV Kho HCM"] = 1 |

## Not verified here

- **Máy quét bắn mã rồi Enter dồn trong cùng một chu kỳ render** — `runActions` chờ `networkidle`
  sau mỗi hành động nên không tái hiện được cửa sổ đó; phần chống Enter dồn (`addInFlightRef`)
  vốn không đổi trong lần sửa này.
- **Lưu dòng đang sửa ở S5** — bước dừng ngay sau khi ENTER chọn được người, không bấm "Lưu":
  thứ cần chứng minh là hành vi của phím ENTER trong ô inline, còn bấm Lưu chỉ thêm một lần ghi
  vào `erp_dev`.

## Notes

Dữ liệu cố định của `erp_dev`, chi nhánh HCM — seed đổi thì cả năm bước phải đổi theo:

- `NV Kho HCM` mang mã nhân viên `NV000004`; S2 gõ đúng mã đó, và mã **không** nằm trong tên nên
  chỉ đường khớp tuyệt đối theo `employeeCode` mới chọn được. S1 cũng tra bằng mã chứ không bằng
  tên: bộ tìm của server khớp theo từng trường, nên một chuỗi vắt qua cả họ lẫn tên ("NV Kho")
  trả về rỗng.
- `NhanVienBH` và `NhanVienTN` cùng tiền tố: "Nhan" ra hai dòng (S4, không được tự chọn),
  "NhanVienB" ra đúng một dòng (S3, được tự chọn). Cặp này là ranh giới của quy tắc.
- `ABA2777-D-39` có ở kho xuất đang chọn, và chọn hàng bằng chuột là tự thêm dòng ngay
  (`selectAndAdd`), nên S1 không cần bấm nút "Thêm".

Assertion dùng `count input[...][value="…"]` chứ không phải `text=`: cả hai ô đều là `<input>`,
`getByText` không đọc được giá trị của input. Cùng lý do đã ghi trong
`stock-transfer-scan-dest-warehouse/07-verification.md`.

S1 ghi thật một dòng vào phiên kho tạm của `erp_dev` mỗi lần chạy — không tránh được, vì thứ
đang kiểm chính là trạng thái *sau khi* thêm dòng thành công. Bốn bước còn lại không ghi gì.

Ba assertion của S1 là ba nửa khác nhau của cùng một hành vi, và `count [role="listbox"] = 1` là
nửa dễ mất nhất: danh sách chỉ mở khi ô Người vận chuyển thật sự nhận được con trỏ, nên nó là thứ
duy nhất trong bộ này chứng minh phần "focus quay về ô NVC". Hai ô trống thì đã đủ cho phần
"clear".

`wait` cuối chuỗi của S1 bám vào chính ô Người vận chuyển trở về rỗng, chứ **không** bám vào dòng
mới trong bảng. Bám vào dòng thì bước này xanh sai ngay từ lần chạy thứ hai: dòng `NV Kho HCM` của
lần trước vẫn nằm đó nên `wait` thoả ngay lập tức, assert chạy trong lúc dòng mới còn đang bay và
ô vẫn giữ tên người vận chuyển. Bằng chứng cho "dòng đã được thêm" nằm ở ảnh chụp — dòng trên cùng
mang dấu thời gian của lần chạy.

S4 khẳng định cả hai vế: ô vẫn giữ nguyên chuỗi "Nhan" (không bị ghi đè bằng một cái tên) **và**
danh sách vẫn còn đúng hai lựa chọn (popover không bị đóng). Thiếu một trong hai thì "không tự
chọn" vẫn có thể sai theo hướng khác.
