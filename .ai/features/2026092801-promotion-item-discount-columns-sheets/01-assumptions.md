---
feature: promotion-item-discount-columns-sheets
blocking_open: 0
---

# Assumption register

Hỏi một vòng (4 câu) trong phiên 2026-09-28. A-01..A-05 là câu trả lời của
Akenzy. Các dòng còn lại là giả định tôi tự đặt từ code và ảnh MISA. Dòng nào
ghi `pending` thì bạn cứ bác bỏ; phạm vi ảnh hưởng ghi ngay trong dòng đó.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Sheet *Đồng giá* chỉ có `Mã SKU*` + `Tên hàng hóa`. Giá đồng giá vẫn lấy từ ô ở hàng *Thiết lập*, file không mang giá | high | yes | Nếu file mang giá thì nhập khẩu phải ghi đè ô Đồng giá và xử lý file có nhiều giá khác nhau | confirmed | Akenzy chốt 2026-09-28: "Mã SKU + Tên hàng hóa" |
| A-02 | Bỏ hậu tố `(variantLabel)` khỏi tên ở **mọi lưới CTKM**, sửa tại `toPromotionTargets` | high | yes | Nếu chỉ một lưới thì sửa ở `addFromPicker` của `GoodsDiscountGrid` thay vì hàm dùng chung | confirmed | Akenzy chốt 2026-09-28: "Mọi lưới CTKM". Spec `promotion-target.spec.ts:97` đang khẳng định điều ngược lại, phải sửa |
| A-03 | Mọi quyết định của feature `2026092701` không nhắc tới ở đây vẫn giữ: gộp theo mã (A-01 cũ), ẩn Nhập/Xuất ở *Nhóm hàng hóa*, 2.000 dòng, chỉ `.xlsx`, khớp mã không phân biệt hoa thường, item trước rồi mẫu mã | high | no | Mỗi quyết định đổi là một AC mới | confirmed | Yêu cầu chỉ nêu các điểm liệt kê ở `00-intent.md` |
| A-04 | Dòng **mẫu mã chọn trọn** (`PRODUCT`): ĐVT và Giá bán để trống; Giá KM trống ở *%* / *Số tiền* | high | yes | Nếu phải suy từ SKU con thì thêm truy vấn ở server và quy tắc khi các size khác giá | confirmed | Akenzy chốt 2026-09-28: "Để trống". `products` không có cột đơn vị/giá |
| A-05 | File **một sheet** (mẫu cũ, `Sheet1`) vẫn nhập được: không có sheet đúng tên phương thức và file chỉ có một sheet thì đọc sheet đó, tìm cột theo tiêu đề như cũ, cột thừa bỏ qua | high | yes | Nếu từ chối thì file người dùng đã xuất hôm qua không dùng lại được | confirmed | Akenzy chốt 2026-09-28: "Vẫn nhận" |
| A-06 | Tên 3 sheet: `Giảm giá theo %`, `Giảm giá theo số tiền`, `Đồng giá`, đúng nhãn radio ở hàng *Thiết lập*. Nhập khẩu so tên sheet sau khi trim, không phân biệt hoa thường | medium | no | Nếu cần đúng tên sheet của file MISA thì phải có file MISA thật để đối chiếu | pending | Không có file MISA trong repo. Nhãn radio lấy từ `GOODS_DISCOUNT_METHOD_OPTIONS`. `%` hợp lệ trong tên sheet Excel |
| A-07 | Xuất khẩu luôn ra file đủ 3 sheet. Sheet của phương thức đang chọn chứa dữ liệu, hai sheet kia chỉ có tiêu đề. **File mẫu** là xuất khẩu với `lines: []` (cả 3 sheet chỉ có tiêu đề) | medium | no | Nếu mỗi lần xuất chỉ ra một sheet thì file mẫu và file dữ liệu khác bố cục, người dùng phải giữ hai file | pending | Theo câu "có 1 file chung, nhưng 3 sheets" trong yêu cầu |
| A-08 | File **nhiều sheet** không có sheet đúng tên phương thức thì trả 400 *"File không có sheet '{tên}'"*, không đoán sheet | medium | no | Nếu muốn lấy sheet đầu tiên thì một file sai phương thức sẽ bị nhập âm thầm với nghĩa khác | pending | Cùng lý do với A-11 cũ: đổi nghĩa âm thầm nguy hiểm hơn báo lỗi |
| A-09 | Nhập khẩu *Đồng giá*: dòng chỉ cần mã. Mã trống thì bỏ qua dòng (không còn cột giá trị để báo "Thiếu mã SKU"). Trùng mã vẫn là lỗi cả hai dòng. Mã đã có trong lưới thì giữ nguyên, mã mới thì thêm | medium | no | Nếu muốn "dòng sau thắng" với trùng mã thì đổi một nhánh validate | pending | Giữ quy tắc trùng mã của A-14 cũ |
| A-10 | Nhập khẩu *Đồng giá* từ file một sheet có cột `% giảm giá` / `Số tiền giảm`: đọc mã, **bỏ qua** cột giá trị, không báo lỗi | low | no | Nếu muốn từ chối thì thêm một lỗi mức file | pending | Hệ quả của A-05: file cũ nào cũng có một trong hai cột này |
| A-11 | Cột lưới ở phạm vi *Hàng hóa*: `Mã hàng`, `Tên hàng hóa`, `ĐVT`, `Giá bán`, `<cột giá trị>`, `Giá khuyến mại`, copy xuống. *Đồng giá* bỏ `<cột giá trị>` và copy xuống. `Giá khuyến mại` chỉ đọc, tính bằng `promoPrice()` phía client; *Đồng giá* thì bằng ô Đồng giá kể cả dòng `PRODUCT` | medium | no | Nếu Giá KM ở Đồng giá phải trống khi không có giá bán thì đổi một điều kiện hiển thị | pending | Theo ảnh MISA. Giá đồng giá không phụ thuộc giá bán |
| A-12 | Phạm vi *Nhóm hàng hóa* + *Đồng giá* cũng bỏ cột `% giảm giá`. Không thêm cột ĐVT/giá cho nhóm | high | no | Chỉ là một điều kiện hiển thị | pending | Cột bị khoá không có nghĩa ở phạm vi nào |
| A-13 | `GET /inventory/items` (ô tra cứu) trả `sellingPrice` và `unit`, nên dòng chọn bằng ô tra cứu có ĐVT/giá mà không cần gọi thêm | medium | no | Nếu không có thì phải tra lại theo lô, thêm một lượt gọi | pending | `ItemEntity.sellingPrice` (`item.entity.ts:49`), `ItemOption.unit` đang được dùng ở `GoodsDiscountGrid.tsx:292`. Xác minh ở T-01-02 |
| A-14 | Nhập khẩu trả thêm `unit` và `sellingPrice` (dòng `ITEM`) để lưới hiện ĐVT/giá ngay sau khi áp dụng | high | no | Nếu không thì dòng nhập vào trống ĐVT/giá tới khi lưu và mở lại | pending | Cùng truy vấn items hiện có, chỉ thêm hai cột vào `select` |
| A-15 | Tên file tải về giữ `GiamGiaHangHoa.xlsx` cho cả file dữ liệu và file mẫu | low | no | Đổi một chuỗi | pending | Người dùng đã quen tên này ở ảnh 2 |
