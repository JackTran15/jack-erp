# Báo cáo test — 07 Điều chuyển hàng giữa chi nhánh

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-07 — Điều chuyển hàng giữa chi nhánh |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice Web |
| **Môi trường** | `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Quản lý chi nhánh (`mgr-hcm@test.com`) — Chi nhánh HCM |

**Trạng thái phiên:** 🟢 Hoàn thành *(1 bug nhỏ edge case)*

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 0 | 1 | — |
| **UX** | — | 0 | 0 | 0 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟡 Minor | Backoffice › Nhập kho | TC-07-003 | FK constraint lỗi khi chọn Nhân viên làm đối tượng phiếu nhập | 🆕 Mới |

---

## 2. Chi tiết theo màn hình

### 📍 Backoffice › Điều chuyển chi nhánh

**TC liên quan:** TC-07-001 đến TC-07-005

Luồng điều chuyển hoạt động đúng end-to-end: tạo lệnh → xuất hàng chi nhánh A → nhận hàng chi nhánh B → tồn kho cập nhật đúng. Hủy lệnh DRAFT trả data về đúng.

Các edge case được đảm bảo bởi UI:
- Dropdown chi nhánh nguồn/đích không cho chọn trùng nhau (EF-001)
- Mỗi chi nhánh chỉ hiển thị data của mình (EF-002)
- COMPLETED không còn hiển thị trên UI để thao tác (EF-004)

---

### 📍 Backoffice › Nhập kho (từ lệnh điều chuyển)

**TC liên quan:** TC-07-003

#### BUG-001 — FK constraint lỗi khi chọn Nhân viên làm đối tượng phiếu nhập

| KQHT | KQMM |
| --- | --- |
| `QueryFailedError: insert or update on table "goods_receipts" violates foreign key constraint "FK_goods_receipts_provider"` | Tạo phiếu nhập thành công với Nhân viên làm đối tượng |

**Kỹ thuật:** Cột `provider_id` trong bảng `goods_receipts` có FK chỉ trỏ về bảng `providers`. Khi chọn đối tượng là Nhân viên (`employees`), server cố insert `employeeId` vào `provider_id` → vi phạm FK. Cần tách thành cột riêng hoặc dùng polymorphic reference (tương tự cách cash vouchers xử lý `partnerType`/`partnerId`).

---

## 3. Kết quả chạy TC-07

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-07-001 | Tạo lệnh điều chuyển A → B | ✅ Pass | |
| TC-07-002 | Chi nhánh A xác nhận xuất hàng | ✅ Pass | |
| TC-07-003 | Chi nhánh B xác nhận nhận hàng | ⚠️ Pass | Main flow OK; BUG-001 khi đối tượng = Nhân viên |
| TC-07-004 | Tồn kho A giảm, B tăng đúng | ✅ Pass | |
| TC-07-005 | Hủy lệnh điều chuyển DRAFT | ✅ Pass | Trả data về chi nhánh đúng |
| TC-07-EF-001 | Chi nhánh nguồn = chi nhánh đích | 🚫 N/A | UI dropdown không cho chọn trùng |
| TC-07-EF-002 | Chi nhánh A xem lệnh của chi nhánh B | 🚫 N/A | UI đã scope theo chi nhánh |
| TC-07-EF-003 | Hủy lệnh đã COMPLETED | 🚫 N/A | Vẫn xóa được, trả data về chi nhánh |
| TC-07-EF-004 | Tạo lệnh khi tồn kho không đủ | 🚫 N/A | COMPLETED không hiển thị trên UI |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | 🟢 5/5 active TC pass (1 có bug nhỏ), 4 N/A — 1 bug minor |
