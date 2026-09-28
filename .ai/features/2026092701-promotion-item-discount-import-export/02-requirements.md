---
feature: promotion-item-discount-import-export
stories: 4
acceptance_criteria: 22
---

# Requirements — CTKM Giảm giá hàng hóa: Nhập khẩu / Xuất khẩu + Copy xuống

Fixture: `apps/api/test/e2e/setup/promotion-seed.ts` (`SKU-685` = 685.000,
`SKU-100` = 100.000, `SKU-200` = 200.000, `SKU-300` = 300.000).
**[DB]** = đọc lại bằng `SELECT`. **[UI]** = chứng minh bằng ảnh chụp trình duyệt (A-08).

---

## US-01 — Dòng chọn từ lưới được áp dụng ở POS

*Là nhân viên tạo CTKM, tôi chọn hàng ở lưới "Hàng hóa" và muốn POS giảm đúng
những hàng đó.*

- **AC-01** — *Given* lưới *Hàng hóa* có `SKU-685` được chọn bằng ô tra cứu, giảm 10%, *When* bấm **Lưu**, *Then* payload `POST /v2/promotions` có dòng `targetType: ITEM`, `targetId = id của inventory item` **[DB]** `promotion_lines.target_type = 'ITEM'`.
- **AC-02** — *Given* picker trả về một **mẫu mã** (`PRODUCT`) và một **hàng hóa** (`ITEM`), *When* bấm **Lưu**, *Then* mỗi dòng giữ đúng `targetType` mà picker trả về.
- **AC-03** — *Given* CTKM đã lưu có cả dòng `ITEM` và dòng `PRODUCT`, *When* mở lại form rồi lưu mà không sửa gì, *Then* `targetType` của từng dòng không đổi **[DB]**.
- **AC-04** — *Given* CTKM có một dòng `PRODUCT` mang **item id** (hình dạng mà mapper cũ ghi ra), *When* `POST /v2/promotions/evaluate` với `SKU-685`, *Then* phần giảm là 0. Test này khẳng định ngữ nghĩa của engine, tức là tái hiện lỗi A-05. *And* cùng CTKM đó nhưng dòng là `ITEM` thì phần giảm là 68.500.

## US-02 — Copy xuống

- **AC-05** — *Given* phương thức *%* và lưới có 4 dòng đã chọn hàng với giá trị `30, 10, (trống), 5`, *When* bấm icon copy xuống ở dòng 1, *Then* dòng 2–4 đều thành `30`, dòng 1 giữ `30` **[UI]**.
- **AC-06** — *Given* bấm copy xuống ở dòng 2, *Then* dòng 1 **không đổi**, chỉ các dòng bên dưới dòng 2 đổi **[UI]**.
- **AC-07** — *Given* dòng trống cuối lưới (chưa chọn hàng), *Then* dòng đó không có icon copy xuống và không nhận giá trị bị chép **[UI]**.
- **AC-08** — *Given* phương thức *Đồng giá*, *Then* cột copy xuống không hiển thị. *Given* phạm vi *Nhóm hàng hóa* + *Số tiền*, *Then* copy xuống vẫn hoạt động **[UI]**.

## US-03 — Xuất khẩu

- **AC-09** — *Given* lưới *Hàng hóa* + *%* có `SKU-685`=30 và `SKU-100`=10, *When* bấm **Xuất khẩu**, *Then* tải về một file `.xlsx`. Dòng 1 là tiêu đề `Mã SKU* | Tên hàng hóa | Đơn vị tính | Giá bán | % giảm giá | Giá khuyến mại`. Hai dòng dữ liệu theo đúng thứ tự trên lưới. `SKU-685` có `Giá bán` 685.000, `% giảm giá` 30, `Giá khuyến mại` 479.500.
- **AC-10** — *Given* phương thức *Số tiền*, *Then* cột giá trị có tiêu đề `Số tiền giảm` và `Giá khuyến mại = max(0, giá bán − số tiền)`. Ví dụ `SKU-100` giảm 150.000 thì giá khuyến mại là `0`.
- **AC-11** — *Given* lưới chỉ có dòng trống, *When* bấm **Xuất khẩu**, *Then* tải về **file mẫu** chỉ có hàng tiêu đề, cột giá trị theo phương thức đang chọn.
- **AC-12** — *Given* request xuất khẩu chứa `targetId` của **tổ chức khác**, *Then* dòng đó không xuất hiện trong file. Không lộ mã/tên của tổ chức khác.
- **AC-13** — *Given* phạm vi *Nhóm hàng hóa* hoặc phương thức *Đồng giá*, *Then* hai nút **Nhập khẩu / Xuất khẩu** bị ẩn **[UI]**.

## US-04 — Nhập khẩu

- **AC-14** — *Given* file có `SKU-685`=30, `SKU-200`=20 (cột `% giảm giá`), *When* `POST .../import` với `method=PERCENT`, *Then* response có 2 dòng hợp lệ, mỗi dòng có `rowNumber`, `targetType: ITEM`, `targetId`, `code`, `name`, `value`, và 0 lỗi.
- **AC-15** — *Given* một file có đủ các dòng lỗi sau, *Then* mỗi dòng lỗi được trả kèm **số dòng Excel** và **lý do tiếng Việt**, còn các dòng hợp lệ vẫn được trả về:
  - mã không tồn tại → *"Không tìm thấy hàng hóa có mã …"*
  - mã trống nhưng có giá trị → *"Thiếu mã SKU"*
  - giá trị trống, không phải số, ≤ 0, hoặc `%` > 100 → *"% giảm giá phải lớn hơn 0 và không quá 100"* / *"Số tiền giảm phải lớn hơn 0"*
  - cùng một mã xuất hiện hai lần → cả hai dòng lỗi *"Mã SKU bị trùng trong file (dòng x, y)"*
- **AC-16** — *Given* file có cột `Số tiền giảm` nhưng request là `method=PERCENT`, hoặc file thiếu cột `Mã SKU`, *Then* trả **400**, thông báo nói rõ cột nào thiếu hoặc không khớp, không trả dòng nào (A-11).
- **AC-17** — *Given* mã viết khác hoa thường hoặc có khoảng trắng hai đầu (`" sku-685 "`), *Then* vẫn khớp `SKU-685` (A-12). *Given* mã là **mã mẫu mã**, *Then* khớp với `targetType: PRODUCT`.
- **AC-18** — *Given* mã chỉ tồn tại ở **tổ chức khác**, *Then* báo lỗi *"Không tìm thấy…"* như mã không tồn tại.
- **AC-19** — *Given* file có hơn 2.000 dòng dữ liệu, hoặc không phải `.xlsx`, *Then* trả **400** kèm thông báo tiếng Việt (A-09, A-17).
- **AC-20** — **Round-trip**: *Given* file xuất ở AC-09, *When* nhập lại chính file đó, *Then* các dòng hợp lệ có đúng tập `targetId` và `value` đã xuất, 0 lỗi.
- **AC-21** — *Given* lưới có `SKU-685`=30 (đã có) và `SKU-300`=15, *When* nhập file `SKU-685`=50, `SKU-100`=10, *Then* lưới thành `SKU-685`=50 (ghi đè), `SKU-300`=15 (giữ nguyên), `SKU-100`=10 (thêm). Không dòng nào bị nhân đôi, dòng trống vẫn ở cuối (A-01) **[UI]**.
- **AC-22** — *Given* file có cả dòng lỗi lẫn dòng hợp lệ, *When* nhập trên giao diện, *Then* dialog liệt kê các dòng lỗi (số dòng + lý do) trước khi áp dụng. Bấm áp dụng thì chỉ các dòng hợp lệ vào lưới. Nhập khẩu **không** tự lưu CTKM: sau khi nhập, DB chưa đổi cho tới khi bấm **Lưu** **[UI]**.
