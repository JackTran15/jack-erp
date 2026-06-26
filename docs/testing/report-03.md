# Báo cáo test — 03 Bán hàng tại POS

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-03 — Bán hàng tại POS |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | POS Web |
| **Môi trường** | `http://localhost:3001` / API `:4000` |
| **Tài khoản** | Nhân viên (`staff-hcm@test.com`) — Chi nhánh HCM |

**Trạng thái phiên:** 🟢 Hoàn thành *(có 2 bug cần fix)*

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 1 | 1 | — |
| **UX** | — | 1 | 2 | 2 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟠 Major | POS › Thanh toán | TC-03-002 | Nhân viên thiếu quyền `customer.write` | ✅ Fixed (seed) |
| BUG-002 | Bug | 🟡 Minor | POS › Hóa đơn | TC-03-003 | Dùng điểm không tích điểm mới (còn 30, KQMM 107) | 🆕 Mới |
| UX-001 | UX | 🟠 Cần sửa | POS › Dialog Thêm KH | TC-03-002 | Dialog Thêm khách hàng chưa tích hợp cấp thẻ thành viên | 🆕 Mới |
| UX-002 | UX | 🟡 Nhỏ | POS › Dialog Cấp thẻ | TC-03-002 | Dropdown chọn thẻ bị overscroll | 🆕 Mới |
| UX-003 | UX | 🟡 Nhỏ | POS › In hóa đơn | TC-03-003 | In hóa đơn chưa hiển thị điểm đã đổi | 🆕 Mới |
| UX-004 | UX | 💡 Gợi ý | POS › Chi tiết hóa đơn | TC-03-003/006 | Chi tiết hóa đơn chưa show điểm đã đổi | 🆕 Mới |
| UX-005 | UX | 💡 Gợi ý | POS › Thanh toán | TC-03-EF-003 | Error message kỹ thuật khi dùng điểm vượt | 🆕 Mới |
| UX-006 | UX | 💡 Gợi ý | POS › Thanh toán | TC-03-EF-004 | Error message kỹ thuật khi thanh toán vượt | 🆕 Mới |

---

## 2. Chi tiết theo màn hình

### 📍 POS › Thanh toán / Quản lý khách hàng

**TC liên quan:** TC-03-002  
**Route:** `http://localhost:3001`

#### BUG-001 — Nhân viên thiếu quyền `customer.write`

| KQHT | KQMM |
| --- | --- |
| Lỗi: `Không có quyền thao tác khách hàng (customer.write)` khi tạo/tìm KH từ POS | Nhân viên tạo và tìm khách hàng bình thường trong POS |

**Trạng thái:** ✅ Fixed — đã seed thêm quyền `customer.write` cho role Nhân viên.

#### UX-001 — Dialog "Thêm khách hàng" chưa tích hợp cấp thẻ

**Hiện tại:** Thêm KH xong, phải vào dialog "Cấp thẻ" riêng mới cấp được thẻ thành viên.  
**Đề xuất:** Tích hợp bước cấp thẻ ngay trong dialog Thêm khách hàng.

#### UX-002 — Dropdown chọn thẻ bị overscroll

**Màn hình:** Dialog Cấp thẻ thành viên.  
**Hiện tại:** Dropdown chọn thẻ cuộn quá mức (overscroll).  
**Đề xuất:** Giới hạn `max-height`, scroll nội bộ — giống UX-002 trong report-00.

---

### 📍 POS › Hóa đơn (chi tiết + in)

**TC liên quan:** TC-03-003, TC-03-006

#### BUG-002 — Dùng điểm không tích điểm mới

| KQHT | KQMM |
| --- | --- |
| Sau hóa đơn dùng điểm: điểm = 80 - 50 = **30** (không tích thêm từ 775,000 thanh toán) | Điểm = 80 - 50 + floor(775,000 ÷ 10,000) = **107** |

**Kỹ thuật:** Server có thể bỏ qua bước cộng điểm (`pointsEarned`) khi hóa đơn có `pointsDiscountAmount > 0`.

#### UX-003 — In hóa đơn chưa hiển thị điểm đã đổi

**Đề xuất:** In hóa đơn thêm dòng: *"Đổi điểm: -50 điểm (−25,000 VNĐ)"*.

#### UX-004 — Chi tiết hóa đơn chưa show điểm đã đổi

**Đề xuất:** Màn hình chi tiết hóa đơn thêm dòng tóm tắt điểm sử dụng / điểm tích được.

---

### 📍 POS › Error messages

#### UX-005 — EF-003: Message điểm vượt kỹ thuật

| KQHT | KQMM |
| --- | --- |
| `HTTP 400: Insufficient points: balance=N, requested=M` | `Số điểm tối đa có thể dùng = {số điểm hiện có}` |

#### UX-006 — EF-004: Message thanh toán vượt kỹ thuật

| KQHT | KQMM |
| --- | --- |
| `HTTP 400: Total payments (1000000) exceed the amount due (800000)` | `Tổng tiền thanh toán phải không vượt quá số tiền còn lại của hóa đơn.` |

---

## 3. Kết quả chạy TC-03

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-03-001 | Bán hàng cơ bản, tiền mặt đủ | ✅ Pass | |
| TC-03-002 | Bán hàng cho KH có tài khoản, tích điểm | ⚠️ Pass | BUG-001 (fixed), UX-001, UX-002 |
| TC-03-003 | Dùng điểm giảm giá | ⚠️ Pass | BUG-002: không tích điểm mới; UX-003 |
| TC-03-004 | Bán chịu, tạo công nợ | ✅ Pass | |
| TC-03-005 | Tồn kho giảm đúng sau checkout | ✅ Pass | |
| TC-03-006 | Xem danh sách hóa đơn, lọc | ✅ Pass | UX-004 |
| TC-03-EF-001 | ~~Checkout không có vị trí~~ | 🚫 N/A | POS tự lấy vị trí từ Showroom |
| TC-03-EF-002 | Bán chịu không có khách hàng | ✅ Pass | "Tính vào công nợ" bị disabled khi chưa có KH |
| TC-03-EF-003 | Dùng điểm vượt số dư | ✅ Pass | UX-005: message kỹ thuật |
| TC-03-EF-004 | Thanh toán vượt tổng hóa đơn | ✅ Pass | UX-006: message kỹ thuật |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | ✅ 9/10 pass (1 N/A) — 2 bug, 4 UX issue |
