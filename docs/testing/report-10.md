# Báo cáo test — 10 Đổi trả hàng hóa

---

## Thông tin phiên test

| Mục | Giá trị |
| --- | --- |
| **Test case** | TC-10 — Đổi trả hàng hóa |
| **Người test** | LocTran |
| **Ngày test** | 2026-06-26 |
| **Ứng dụng** | POS Web / Backoffice Web |
| **Môi trường** | `http://localhost:3001` / `http://localhost:3000` / API `:4000` |
| **Tài khoản** | Nhân viên (`staff-hcm@test.com`) & Quản lý chi nhánh (`mgr-hcm@test.com`) |

**Trạng thái phiên:** 🔴 Có bug — type sai cho hóa đơn trả/đổi hàng

---

## 1. Tóm tắt

### Thống kê

| | 🔴 Critical | 🟠 Major | 🟡 Minor | 💡 UX |
| --- | ---: | ---: | ---: | ---: |
| **Bug** | 0 | 1 | 1 | — |
| **UX** | — | 0 | 0 | 1 |

### Danh sách issue

| ID | Loại | Mức độ | Màn hình | TC ref | Tiêu đề | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | Bug | 🟠 Major | POS › Đổi trả | TC-10-001, TC-10-002 | Hóa đơn trả/đổi hàng tạo ra với `type = SALE` thay vì `RETURN`/`EXCHANGE` | 🆕 Mới |
| BUG-002 | Bug | 🟡 Minor | POS › Đổi trả | TC-10-001, TC-10-002 | Sau khi đổi trả toàn phần, hóa đơn gốc vẫn xuất hiện trong danh sách đổi trả | 🆕 Mới |
| UX-001 | UX | 💡 Gợi ý | Backoffice › Báo cáo | TC-10-003 | Cột Trạng thái trong "Bảng kê hóa đơn và đơn hàng" hiển thị enum thay vì label | 🆕 Mới |

---

## 2. Chi tiết theo màn hình

### 📍 POS › Đổi trả hàng

Tồn kho hoạt động đúng: trả hàng hoàn trả đúng số lượng, đổi hàng trừ/cộng đúng hai dòng hàng. Hóa đơn trả được tạo riêng (RTN-...) — hóa đơn gốc được giữ nguyên (hành vi đúng).

#### BUG-001 — Hóa đơn trả/đổi hàng type = SALE

| KQHT | KQMM |
| --- | --- |
| Hóa đơn RTN-... có `type = SALE` | Hóa đơn trả hàng `type = RETURN`; hóa đơn đổi hàng `type = EXCHANGE` |

**Hậu quả:** Không thể lọc hóa đơn theo loại RETURN/EXCHANGE trong báo cáo. Hóa đơn đổi hàng và trả hàng hiển thị giống hệt nhau, không phân biệt được trên UI.

**Kỹ thuật:** Backend POS return/exchange handler không set `type` đúng khi tạo hóa đơn RTN. Cần gán `InvoiceType.RETURN` hoặc `InvoiceType.EXCHANGE` tương ứng thay vì để fallback về `SALE`.

---

#### BUG-002 — Hóa đơn gốc vẫn hiện sau khi đổi trả toàn phần

| KQHT | KQMM |
| --- | --- |
| Hóa đơn gốc vẫn xuất hiện trong danh sách đổi trả | Sau khi đổi trả toàn phần (`returnedQty = totalQty`), hóa đơn gốc bị ẩn khỏi danh sách |

**Kỹ thuật:** API `/invoices/eligible-returns` (hoặc danh sách đổi trả POS) không filter bỏ hóa đơn đã trả đủ toàn phần.

---

### 📍 Backoffice › Báo cáo — Bảng kê hóa đơn và đơn hàng

#### UX-001 — Cột Trạng thái hiển thị enum

Cột "Trạng thái" đang hiển thị giá trị enum raw (ví dụ: `PAID`, `CANCELLED`) thay vì label tiếng Việt tương ứng ("Đã thanh toán", "Đã hủy"). Cần map sang `INVOICE_STATUS_LABEL` hoặc tương đương.

---

## 3. Kết quả chạy TC-10

| TC | Tên | Kết quả | Ghi chú |
| --- | --- | --- | --- |
| TC-10-001 | Trả hàng từ hóa đơn → hoàn tiền mặt | ❌ NG | Tồn kho đúng; BUG-001 (type=SALE), BUG-002 (vẫn hiện sau trả hết) |
| TC-10-002 | Đổi hàng cùng giá trị | ❌ NG | Tồn kho đúng; BUG-001 (type=SALE, không phân biệt vs RETURN), BUG-002 |
| TC-10-003 | Tồn kho & báo cáo sau đổi trả | ⚠️ Pass | Tồn kho đúng; UX-001: Trạng thái hiển thị enum |
| TC-10-EF-001 | Trả vượt maxReturnable | ✅ Pass | |
| TC-10-EF-002 | Trả từ hóa đơn DRAFT/CANCELLED | ✅ Pass | |
| TC-10-EF-003 | Trả từ hóa đơn đã trả hết | ✅ Pass | |

---

## Sign-off

| Người test | Ngày | Kết quả |
| --- | --- | --- |
| LocTran | 2026-06-26 | 🔴 4/6 active TC pass, 2 NG — 1 bug major, 1 bug minor, 1 UX |
