# Báo cáo test — 01 Thiết lập hệ thống

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-01 — Thiết lập hệ thống |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice |
| **Môi trường** | `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Quản trị hệ thống (`inventory.admin@erp.local`) |

**Trạng thái phiên:** 🟢 Hoàn thành — tất cả pass, không có bug

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 0 | 0 | — |
| **UX** | — | 0 | 0 | 0 |

### Danh sách issue

*(Không có issue)*

---

## 2. Chi tiết theo màn hình

*(Không có bug/UX cần ghi nhận)*

---

## 3. Kết quả chạy TC-01

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-01-001 | Tạo chi nhánh mới, kiểm tra Showroom tự tạo | ✅ Pass | |
| TC-01-002 | Tạo kho lưu trữ thêm trong chi nhánh | ✅ Pass | |
| TC-01-003 | Tạo vị trí (bin) trong kho | ✅ Pass | |
| TC-01-004 | Tạo user Nhân viên, gán chi nhánh | ✅ Pass | |
| TC-01-005 | Tạo user Quản lý chi nhánh | ✅ Pass | |
| TC-01-006 | Tạo nhóm hàng hoá 2 cấp | ✅ Pass | |
| TC-01-007 | Tạo hàng hóa + biến thể (Size-only & Màu+Size) | ✅ Pass | |
| TC-01-008 | Đặt kho nhập hàng mặc định (isDefaultReceiving) | ✅ Pass | |
| TC-01-EF-001 | Tạo chi nhánh trùng tên | ✅ Pass | |
| TC-01-EF-002 | Tạo vị trí mã trùng trong cùng kho | ✅ Pass | |
| TC-01-EF-003 | Đăng nhập sai mật khẩu | ✅ Pass | |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | ✅ 11/11 pass — không có bug, không có UX issue |
