# Báo cáo test — 06 Quỹ tiền

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-06 — Quỹ tiền (Phiếu Thu / Phiếu Chi / Kiểm kê / Sổ chi tiết) |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice Web |
| **Môi trường** | `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Quản lý chi nhánh (`mgr-hcm@test.com`) — Chi nhánh HCM |

**Trạng thái phiên:** 🟡 Hoàn thành một phần *(POST phiếu thu/chi bị block — WIP)*

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 2 | 0 | — |
| **UX** | — | 0 | 0 | 1 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟠 Major | Backoffice › Thu chi tiền mặt | TC-06-001, TC-06-003 | Phiếu thu/chi tạo xong ở DRAFT thay vì tự động POSTED | 🆕 Mới |
| BUG-002 | Bug | 🟠 Major | Backoffice › Thu chi tiền mặt | TC-06-002, TC-06-004 | Chưa có UI đảo phiếu (reverse) cho phiếu thu/chi đã POSTED | 🆕 Mới |
| UX-001 | UX | 💡 Gợi ý | Backoffice › Tạo phiếu thu/chi | TC-06-001, TC-06-003 | Nhân viên thu/chi tự điền là account đang login | 🆕 Mới |

---

## 2. Chi tiết theo màn hình

### 📍 Backoffice › Thu chi tiền mặt

**TC liên quan:** TC-06-001, TC-06-003

#### BUG-001 — Phiếu thu/chi tạo xong ở DRAFT thay vì tự động POSTED

| KQHT | KQMM |
| --- | --- |
| Nhấn **Lưu** → phiếu tạo xong ở trạng thái DRAFT. Không ảnh hưởng số dư quỹ, không xuất hiện trong Sổ chi tiết. | Nhấn **Lưu** → phiếu POSTED ngay (giống phiếu nhập/xuất kho). Tạo cash movement, cập nhật số dư quỹ. Không cần bước POST riêng. |

**Kỹ thuật:** `CashReceiptsService.create()` và `CashPaymentsService.create()` đang hardcode `status: DRAFT`. Cần đổi luồng tạo thành auto-post (gọi `recordMovement` trong cùng transaction, set `status: POSTED`) — tương tự cách `GoodsReceiptService` hoạt động.

#### BUG-002 — Chưa có UI đảo phiếu (reverse)

| KQHT | KQMM |
| --- | --- |
| Không có nút Đảo phiếu trên danh sách hoặc chi tiết phiếu thu/chi đã POSTED. Phiếu đã POSTED cũng không thể sửa (đúng thiết kế — immutable). | Có nút Đảo phiếu → tạo phiếu đối nghịch POSTED, bù trừ cash movement, hoàn lại số dư |

**Kỹ thuật:** API `POST /cash-receipts/:id/reverse` và `/cash-payments/:id/reverse` đã tồn tại. Hook `useCashReceiptMutations().reverse` đã sẵn sàng. Chỉ cần thêm nút vào UI.

---

#### UX-001 — Nhân viên thu/chi tự điền là account đang login

**Hiện tại:** Trường "Nhân viên thu" / "Nhân viên chi" tự điền sẵn thông tin người dùng đang đăng nhập.  
**Đề xuất:** Xác nhận đây có phải behavior mong muốn không. Nếu có, cân nhắc cho phép xóa/đổi sang nhân viên khác.

---

### 📍 Backoffice › Kiểm kê tiền mặt

**TC liên quan:** TC-06-005, TC-06-006

Kiểm kê hoạt động đúng. Khi có chênh lệch, hệ thống tự tạo phiếu thu/chi điều chỉnh và tự POST — số dư quỹ cập nhật đúng.

---

### 📍 Backoffice › Sổ chi tiết tiền mặt

**TC liên quan:** TC-06-007

Sổ chi tiết hiển thị đúng. Dữ liệu thực tế từ TC-03 (PT000001–PT000006 — POS sales). Phiếu DRAFT từ TC-06-001/003 không xuất hiện trong sổ (đúng thiết kế).

---

### 📍 Backoffice › Kiểm tra bất biến

**TC liên quan:** TC-06-EF-002

Phiếu đã POSTED không thể chỉnh sửa — nút Sửa bị disabled, hành vi đúng.

---

## 3. Kết quả chạy TC-06

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-06-001 | Tạo Phiếu Thu DRAFT → POST | ❌ NG | DRAFT tạo được; POST bị block (BUG-001); UX-001 |
| TC-06-002 | Đảo Phiếu Thu đã POST | ❌ NG | Chưa có UI đảo phiếu (BUG-002); blocked thêm bởi BUG-001 |
| TC-06-003 | Tạo Phiếu Chi DRAFT → POST | ❌ NG | DRAFT tạo được; POST bị block (BUG-001); UX-001 |
| TC-06-004 | Đảo Phiếu Chi đã POST | ❌ NG | Chưa có UI đảo phiếu (BUG-002); blocked thêm bởi BUG-001 |
| TC-06-005 | Kiểm kê — thực tế > hệ thống → Phiếu Thu tự tạo | ✅ Pass | Phiếu chênh lệch tự tạo và POSTED |
| TC-06-006 | Kiểm kê — thực tế < hệ thống → Phiếu Chi tự tạo | ✅ Pass | Phiếu chênh lệch tự tạo và POSTED |
| TC-06-007 | Sổ chi tiết tiền mặt | ✅ Pass | OK; phiếu DRAFT đúng không xuất hiện |
| TC-06-EF-001 | POST phiếu chi khi số dư không đủ | 🚫 N/A | Không đổi được DRAFT → POSTED để test |
| TC-06-EF-002 | Cố sửa Phiếu đã POST | ✅ Pass | Nút Sửa disabled đúng |
| TC-06-EF-003 | Denomination không khớp tổng | 🚫 N/A | UI chỉ nhập từng mệnh giá, không nhập tổng trực tiếp |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | 🟡 4/8 active TC pass (4 NG), 2 N/A — 2 bug, 1 UX |
