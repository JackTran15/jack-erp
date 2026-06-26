# Báo cáo test — 08 Xuất kho thủ công

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-08 — Xuất kho thủ công |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | Backoffice Web |
| **Môi trường** | `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Quản lý chi nhánh (`mgr-hcm@test.com`) — Chi nhánh HCM |

**Trạng thái phiên:** 🟢 Hoàn thành *(1 UX nhỏ)*

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 0 | 0 | — |
| **UX** | — | 0 | 0 | 1 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| UX-001 | UX | 💡 Gợi ý | Backoffice › Xuất kho | TC-08-EF-001 | Error message số lượng kỹ thuật (`lines.0.quantity must not be less than 0.01`) | 🆕 Mới |

---

## 2. Chi tiết theo màn hình

### 📍 Backoffice › Xuất kho

**Phiếu xuất kho tự động POSTED ngay khi tạo** — không có bước DRAFT riêng (giống phiếu nhập kho).

**TC-08-002** (Hủy DRAFT) không có case vì không tồn tại trạng thái DRAFT.

Xóa phiếu đã POSTED hoạt động đúng: hệ thống hoàn trả số lượng về kho sau khi xóa.

#### UX-001 — Error message số lượng kỹ thuật

| KQHT | KQMM |
| --- | --- |
| `lines.0.quantity must not be less than 0.01` | `Số lượng phải lớn hơn 0` |

---

## 3. Kết quả chạy TC-08

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-08-001 | Xuất kho cơ bản → tồn kho giảm | ✅ Pass | Auto-POSTED khi tạo |
| TC-08-002 | ~~Hủy phiếu DRAFT~~ | 🚫 N/A | Không có DRAFT — auto-POSTED |
| TC-08-EF-001 | Xuất kho số lượng = 0 | ✅ Pass | UX-001: message kỹ thuật |
| TC-08-EF-002 | Xóa phiếu đã POSTED | ✅ Pass | Xóa được, tồn kho hoàn trả đúng |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | 🟢 3/3 active TC pass, 1 N/A — 1 UX nhỏ |
