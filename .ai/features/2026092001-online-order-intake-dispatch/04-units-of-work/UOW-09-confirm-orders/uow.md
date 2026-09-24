---
id: UOW-09
slug: confirm-orders
title: Admin duyệt nhiều đơn trong pool, được cảnh báo thiếu hàng
demoable: true
duration: 2d
depends_on: [UOW-02, UOW-08]
requirements: [US-09]
verifies: [AC-30, AC-31, AC-32, AC-33, AC-34, AC-35]
risk: medium
status: todo
rollback: revert migration + service/controller + trang; đơn đã duyệt giữ confirmed_at (vô hại khi cột bị drop), guard dispatch biến mất nên pool quay về hành vi UOW-02
---

# UOW-09 — Duyệt đơn (đợt 2, Task 1)

## Demo script
1. Fixture: `SKU-500` = 1 ở CN-A + 1 ở CN-B; `SKU-900` = 0. Đặt 3 đơn web: X (`SKU-500 × 1`), Y (`SKU-500 × 3`), Z (`SKU-500 × 1`, `SKU-900 × 2`)
2. `/orders/dispatch`: cả ba hiện "Chờ duyệt"; gọi thẳng `POST /admin/sales-orders/:id/dispatch` cho X → 409 `ORDER_NOT_CONFIRMED`
3. Tick X, Y, Z → "Duyệt đơn" → dialog cảnh báo liệt kê X, Y, Z theo đúng thứ tự đó; dòng thiếu tô vàng, ghi cần / tồn / thiếu
4. Bấm "Huỷ" → Adminer: cả ba `confirmed_at IS NULL`
5. Mở lại → "Vẫn duyệt" → cả ba "Đã duyệt"; `sales_order_dispatch_events` có 3 dòng `CONFIRM` đúng người
6. Tick 2 đơn đủ hàng khác, huỷ một đơn ở tab khác, rồi duyệt → đơn còn lại Đã duyệt, đơn bị huỷ báo lỗi cạnh mã đơn
7. Tài khoản thu ngân gọi `POST .../confirm` → 403

## In scope
- `confirmed_at`, `confirmed_by`, enum `CONFIRM` trong lịch sử điều phối (ADR-08)
- `POST /admin/sales-orders/:id/confirm`, `POST /admin/sales-orders/stock-check` (ADR-09)
- Guard `ORDER_NOT_CONFIRMED` trên `dispatch()` (A-30)
- Nút "Duyệt đơn" + dialog cảnh báo + cột "Chờ duyệt / Đã duyệt"

## Not in scope
- Chọn chi nhánh từng đơn, Validate (UOW-10) — nhưng `stock-check` đã nhận `branchId` theo đơn ở đây
- Bỏ duyệt (un-confirm) — không có trong yêu cầu

## Risks
| Risk | Mitigation |
| --- | --- |
| Guard mới trên `dispatch()` làm đỏ e2e và demo cũ của UOW-02/05/06/07 (chúng phân đơn chưa duyệt) | T-09-04 sửa fixture các e2e đó: duyệt trước khi phân. Chạy cả bộ `admin-dispatch`, `online-order-*` |
| Nhầm `confirm` với `approve()` của thu ngân | Tên khác hẳn trong code (ADR-08, §7); `approve()` không đổi một dòng |
| `CHK_sales_order_dispatch_events_shape` từ chối dòng `CONFIRM` | Migration sửa CHECK cùng lúc thêm enum; e2e tự tạo ràng buộc trong `beforeAll` (A-26) |

> **2026-09-24 (lần 2):** Akenzy chuyển duyệt sang chi nhánh (A-41, ADR-12). Code của UOW này (cột, `confirm`, `stock-check`, dialog) được UOW-11 dùng lại và dời chỗ; bằng chứng AC-30..AC-35 phải lấy lại ở UOW-11 — hai ô dưới bỏ tick cho tới khi đó.

## Definition of done
- [x] AC-30..AC-35 có bằng chứng trong `07-verification.md`, gồm cả ca 403 và 409
- [x] Ảnh chụp (chuyển từ T-09-05): dialog cảnh báo đúng thứ tự X, Y, Z; sau Vẫn duyệt cả ba "Đã duyệt"; Huỷ không đổi gì
- [x] `approve()` của thu ngân và `/mobile/sales-orders` không đổi
- [x] `pnpm --filter @erp/api test` + e2e `admin-dispatch`, `online-order-*`, `partner-order` xanh (OUTBOX_RELAY_DISABLED=1)
