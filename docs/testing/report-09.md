# Báo cáo test — 09 Kiểm kê kho

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-09 — Kiểm kê kho |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice Web |
| **Môi trường** | `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Quản lý chi nhánh (`mgr-hcm@test.com`) — Chi nhánh HCM |

**Trạng thái phiên:** 🟡 Một phần — 1 bug validation + 1 UX nhỏ

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 0 | 1 | — |
| **UX** | — | 0 | 0 | 1 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟡 Minor | Backoffice › Kiểm kê kho | TC-09-EF-001 | Tạo được phiếu kiểm kê rỗng (không có dòng hàng) — không báo lỗi | 🆕 Mới |
| UX-001 | UX | 💡 Gợi ý | Backoffice › Nhập kho | TC-09-003 | Filter "Loại chứng từ" thiếu option "Phiếu nhập kho kiểm kê" | 🆕 Mới |

---

## 2. Chi tiết theo màn hình

### 📍 Backoffice › Kiểm kê kho

Luồng kiểm kê hoạt động đúng end-to-end: tạo phiếu → nhập số đếm thực tế → xử lý → hệ thống tự tạo phiếu nhập/xuất điều chỉnh → tồn kho cập nhật đúng. Phiếu đã POSTED không thể xử lý lại. Khi countedQty = expectedQty không tạo phiếu điều chỉnh.

#### BUG-001 — Tạo được phiếu kiểm kê rỗng

| KQHT | KQMM |
| --- | --- |
| Hệ thống báo lỗi: phiếu phải có ít nhất 1 dòng hàng | Phiếu kiểm kê rỗng được tạo thành công, không có validation |

**Kỹ thuật:** Endpoint `POST /stock-takes` thiếu validation `lines.length >= 1`. Cần thêm guard ở backend (DTO) hoặc service trước khi lưu.

---

### 📍 Backoffice › Nhập kho (từ kiểm kê)

#### UX-001 — Filter "Loại chứng từ" thiếu option

Filter cột "Loại chứng từ" trên danh sách Nhập kho không có option "Phiếu nhập kho kiểm kê" (`STOCK_TAKE`). Người dùng phải scroll toàn bộ danh sách để tìm, không thể lọc nhanh theo mục đích.

---

## 3. Kết quả chạy TC-09

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-09-001 | Kiểm kê dư hàng → Phiếu Nhập điều chỉnh | ✅ Pass | |
| TC-09-002 | Kiểm kê thiếu hàng → Phiếu Xuất điều chỉnh | ✅ Pass | |
| TC-09-003 | Tìm phiếu điều chỉnh trong danh sách nhập/xuất | ✅ Pass | UX-001: filter thiếu option STOCK_TAKE |
| TC-09-EF-001 | Xử lý phiếu kiểm kê rỗng | ❌ NG | BUG-001: tạo được, không báo lỗi |
| TC-09-EF-002 | Xử lý lại phiếu đã POSTED | ✅ Pass | Phiếu read-only đúng |
| TC-09-EF-003 | Số đếm = kỳ vọng → không tạo phiếu điều chỉnh | ✅ Pass | |
| TC-09-EF-004 | Tồn kho phản ánh đúng sau kiểm kê | ✅ Pass | |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | 🟡 6/7 active TC pass, 1 NG — 1 bug minor, 1 UX nhỏ |
