---
id: UOW-06
slug: return-to-pool
title: Chi nhánh trả đơn về pool kèm lý do, Admin phân lại cho chi nhánh khác
demoable: true
duration: 1d
depends_on: [UOW-05]
requirements: [US-05]
verifies: [AC-21, AC-22]
risk: low
status: todo
rollback: revert endpoint + nút; đơn đã trả về pool giữ nguyên branch_id NULL — trạng thái hợp lệ, Admin phân lại bằng tay
---

# UOW-06 — Trả đơn về pool

## Demo script
1. Đơn đã được phân cho Hồ Chí Minh, **chưa** phát hành hoá đơn
2. POS Hồ Chí Minh → mở đơn → "Trả đơn về" → nhập lý do "hết hàng" → xác nhận
3. Lưới đơn hàng của Hồ Chí Minh: đơn biến mất
4. Adminer: `branch_id IS NULL`, `status` vẫn `SENT`; `sales_order_dispatch_events` có dòng `RETURN` kèm lý do "hết hàng"
5. `/orders/dispatch` của Admin: đơn xuất hiện lại
6. Admin phân cho chi nhánh kiểm thử → đơn sang chi nhánh đó; lịch sử điều phối giờ có 3 dòng (DISPATCH → RETURN → DISPATCH)
7. Xử lý một đơn khác tới khi phát hành hoá đơn → bấm "Trả đơn về" → bị từ chối `ORDER_HAS_INVOICE`, `branch_id` không đổi

## In scope
- `POST /admin/sales-orders/:id/return { reason }`
- Nút + hộp nhập lý do trên lưới chi nhánh
- Chặn trả về khi đã phát hành hoá đơn

## Not in scope
- Tự động phân lại — Akenzy chốt phân thủ công
- Hạn xử lý / SLA

## Risks
| Risk | Mitigation |
| --- | --- |
| Trả về đơn đã có hoá đơn nháp (chưa phát hành) để lại hoá đơn nháp mồ côi ở chi nhánh cũ | Trả về phải xoá hoá đơn nháp trong cùng transaction — `invoices.sales_order_id` có comment "cleared on draft delete", đường này đã có |
| Lý do rỗng lọt qua ⇒ lịch sử vô dụng | `reason` bắt buộc ở DTO; `ValidationPipe` chặn |

## Definition of done
- [x] AC-21, AC-22 có bằng chứng trong `07-verification.md`
- [x] Vòng DISPATCH → RETURN → DISPATCH để lại đúng 3 dòng lịch sử
