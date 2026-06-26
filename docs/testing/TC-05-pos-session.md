# TC-05 — Journey: Ca làm việc POS & Đối soát quỹ tiền

## Phạm vi

Kiểm tra luồng quản lý ca làm việc POS: mở ca với quỹ tiền đầu ca, bán hàng trong ca, kiểm đếm tiền cuối ca, đóng ca và duyệt chênh lệch.

**Người thực hiện mặc định:** Nhân viên (`staff-hcm@test.com`) + Quản lý chi nhánh (duyệt chênh lệch)  
**Môi trường:** POS Web + Backoffice — Chi nhánh HCM  
**Điều kiện chung:** Cash Account `Quầy 1 - HCM` (loại REGISTER) đã tồn tại; không có session nào đang mở trên tài khoản này

---

### TC-05-001: Mở ca POS với quỹ tiền đầu ca

> **Mục tiêu:** Xác nhận nhân viên có thể mở ca và ghi nhận số tiền quỹ ban đầu trong két quầy

**Điều kiện:** Cash Account `Quầy 1 - HCM` chưa có session OPEN/ACTIVE_SALES  
**Người thực hiện:** Nhân viên

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Đăng nhập POS → xuất hiện màn hình **Mở ca** | Form mở ca hiển thị |
| 2 | Chọn Cash Account: `Quầy 1 - HCM` | |
| 3 | Nhập quỹ đầu ca: `500,000` | |
| 4 | Nhấn **Mở ca** | Ca được tạo với status = OPEN |
| 5 | Xem thông tin ca | Hiển thị quỹ đầu ca = 500,000; thời gian mở ca |

---

### TC-05-002: Chuyển ca sang trạng thái sẵn sàng bán

> **Mục tiêu:** Xác nhận ca chuyển từ OPEN sang ACTIVE_SALES sau khi bắt đầu bán hàng

**Điều kiện:** Ca đang ở trạng thái OPEN  
**Người thực hiện:** Nhân viên

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Trong POS, nhấn **Bắt đầu bán hàng** | Ca chuyển sang ACTIVE_SALES |
| 2 | Giao diện bán hàng POS hiển thị đầy đủ | Có thể thêm hàng vào giỏ |

---

### TC-05-003: Bán hàng tiền mặt trong ca → kiểm tra cash movement tự tạo

> **Mục tiêu:** Xác nhận mỗi giao dịch thanh toán tiền mặt trong ca tạo ra một cash movement DEPOSIT

**Điều kiện:** Ca đang ACTIVE_SALES; có hàng hóa trong kho  
**Người thực hiện:** Nhân viên

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Tạo hóa đơn, thêm hàng, thanh toán tiền mặt 300,000 | Hóa đơn PAID |
| 2 | Vào Backoffice → **Quỹ tiền → Sổ chi tiết** → chọn `Quầy 1 - HCM` | Sổ chi tiết mở ra |
| 3 | Tìm dòng movement vừa tạo | Có entry: type = DEPOSIT, amount = 300,000, reference = invoice ID |
| 4 | Kiểm tra số dư `Quầy 1 - HCM` | = 500,000 (quỹ đầu) + 300,000 = 800,000 |

**Kiểm tra thêm:**
- [ ] CashMovementEntity với type=DEPOSIT được tạo tự động
- [ ] sessionId của movement khớp với ca đang mở

---

### TC-05-004: Đóng ca — kiểm đếm tiền khớp → tự động duyệt

> **Mục tiêu:** Xác nhận khi tiền thực đếm khớp hệ thống (trong ngưỡng cho phép), ca đóng tự động không cần duyệt

**Điều kiện:** Ca đang ACTIVE_SALES, đã có ít nhất 1 giao dịch bán hàng tiền mặt  
**Người thực hiện:** Nhân viên

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Nhấn **Kết thúc ca** trong POS | Chuyển sang màn hình chuẩn bị đóng ca (status → CLOSING) |
| 2 | Xem số tiền kỳ vọng (expected cash) | Hiển thị: quỹ đầu ca + tổng tiền mặt thu trong ca |
| 3 | Nhập **Tiền thực đếm** = đúng với kỳ vọng | Chênh lệch = 0 |
| 4 | Nhấn **Xác nhận kiểm kê** | Variance tự động approved (varianceApproved = true) |
| 5 | Nhấn **Đóng ca** | Ca chuyển sang CLOSED; không cần duyệt thêm |
| 6 | Màn hình POS yêu cầu mở ca mới | Ca mới chưa được mở |

---

### TC-05-005: Đóng ca — chênh lệch vượt ngưỡng → Quản lý chi nhánh duyệt

> **Mục tiêu:** Xác nhận khi tiền thực đếm lệch quá ngưỡng (mặc định 50,000 VNĐ), cần người có quyền `pos.session.approve_variance` duyệt trước khi đóng ca

**Điều kiện:** Ca đang ACTIVE_SALES; đã có giao dịch tiền mặt  
**Người thực hiện:** Nhân viên (đếm tiền) + Quản lý chi nhánh (duyệt)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Nhân viên nhấn **Kết thúc ca** | Màn hình đóng ca hiển thị |
| 2 | Nhân viên nhập tiền thực đếm thấp hơn kỳ vọng >50,000 | Chênh lệch = -X (X > 50,000) |
| 3 | Nhấn **Xác nhận kiểm kê** | Kết quả tạo được nhưng `varianceApproved = false`; chờ duyệt |
| 4 | Nhân viên cố nhấn **Đóng ca** | Hệ thống không cho phép; yêu cầu có duyệt chênh lệch trước |
| 5 | Quản lý chi nhánh đăng nhập vào màn hình quản lý ca | Thấy ca đang chờ duyệt chênh lệch |
| 6 | Quản lý chi nhánh nhấn **Duyệt chênh lệch** | `varianceApproved = true`, `approvedBy` ghi tên quản lý |
| 7 | Nhân viên quay lại → nhấn **Đóng ca** | Ca chuyển CLOSED thành công |

---

### TC-05-006: Không thể mở ca thứ hai trên cùng một Cash Account đang mở

> **Mục tiêu:** Xác nhận ràng buộc 1 session OPEN/ACTIVE_SALES per Cash Account

**Điều kiện:** Ca đang OPEN hoặc ACTIVE_SALES trên `Quầy 1 - HCM`  
**Người thực hiện:** Nhân viên (hoặc thử từ user khác)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Cố mở ca mới, chọn Cash Account `Quầy 1 - HCM` | Hệ thống báo lỗi: tài khoản này đang có ca chưa đóng |
| 2 | Thử chọn Cash Account khác (nếu có) | Có thể mở ca trên Cash Account khác |

**Kiểm tra thêm:**
- [ ] Server trả về lỗi 400 khi cố POST /sessions/open với cashAccountId đang có session OPEN/ACTIVE_SALES

---

## Trường hợp biên & trường hợp lỗi

### TC-05-EF-001: Đóng ca mà chưa submit kiểm đếm tiền

> **Mục tiêu:** Xác nhận không thể đóng ca khi chưa hoàn thành bước kiểm đếm

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Nhấn **Kết thúc ca** → ca chuyển sang CLOSING | |
| 2 | Nhấn thẳng **Đóng ca** mà không nhập tiền thực đếm | Hệ thống báo lỗi: cần kiểm đếm tiền trước; nút Đóng ca disabled |

---

### TC-05-EF-002: Nhân viên cố duyệt chênh lệch quỹ (thiếu quyền approve_variance)

> **Mục tiêu:** Xác nhận chỉ user có `pos.session.approve_variance` mới duyệt được chênh lệch

**Điều kiện:** Ca đang chờ duyệt chênh lệch (từ TC-05-005)

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | `staff-hcm@test.com` truy cập trang duyệt chênh lệch | Không thấy nút Duyệt / bị 403 khi gọi API |
| 2 | Gọi API `POST /sessions/:id/reconciliation/approve` với token của staff | Server trả về 403 Forbidden |

---

### TC-05-EF-003: Submit kiểm đếm tiền hai lần

> **Mục tiêu:** Xác nhận không thể submit reconciliation hai lần cho cùng một ca

**Điều kiện:** Đã submit reconciliation một lần thành công

| Bước | Thao tác | Kết quả mong đợi |
|------|----------|-----------------|
| 1 | Submit kiểm đếm lần đầu (actualCash = X) | Reconciliation được tạo |
| 2 | Thử submit lại (actualCash = Y) | Hệ thống báo lỗi: ca này đã có kiểm đếm rồi |
