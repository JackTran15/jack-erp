---
id: UOW-08
slug: stock-short-label
title: Đơn đối tác thiếu hàng toàn chuỗi mang nhãn "Thiếu hàng"
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-03]
requirements: [US-10]
verifies: [AC-36, AC-37, AC-38, AC-39]
risk: low
status: todo
rollback: revert migration (hai cột mới, không ai khác đọc) + revert service; đơn đã nhận giữ nguyên, chỉ mất nhãn
---

# UOW-08 — Nhãn thiếu hàng lúc nhận đơn (đợt 2, Task 2)

## Demo script
1. Adminer: đặt tồn `SKU-500` = 1 ở CN-A, 1 ở CN-B; `SKU-900` = 0 mọi nơi
2. Website đặt đơn A: `SKU-500 × 2` → 201; Adminer: `stock_short = false`, dòng có `chain_stock_at_intake = 2`
3. Website đặt đơn B: `SKU-500 × 3` + `SKU-900 × 1` → 201, body cùng hình dạng với đơn A (không có trường thiếu hàng)
4. Adminer: đơn B `stock_short = true`; dòng SKU-500 `chain_stock_at_intake = 2`, dòng SKU-900 `= 0`
5. Backoffice `/orders/dispatch`: đơn B có nhãn vàng "Thiếu hàng", đơn A không; `/orders/all` cũng vậy
6. Nhập thêm 10 SKU-500, 10 SKU-900 vào CN-A → reload: đơn B **vẫn** mang nhãn (snapshot, A-35)

## In scope
- Cột `sales_orders.stock_short`, `sales_order_lines.chain_stock_at_intake` (ADR-10)
- `StockAvailabilityService` (ADR-09) — UOW-09 và UOW-10 dùng lại
- Ghi snapshot trong transaction `createFromPartner`
- Badge "Thiếu hàng" trên `/orders/dispatch` và `/orders/all`

## Not in scope
- Endpoint `stock-check` và tính sống (UOW-09)
- Backfill đơn cũ — `stock_short = false`, `chain_stock_at_intake = NULL`
- Báo cho đối tác (A-36)

## Risks
| Risk | Mitigation |
| --- | --- |
| Đơn có hai dòng cùng `itemCode` bị so từng dòng thay vì tổng → lọt nhãn | Gộp theo `item_id` trước khi so; unit test ca trùng dòng |
| Đọc tồn trong transaction nhận đơn làm chậm đường đối tác | Một câu `SUM ... GROUP BY item_id` trên index `IDX_stock_balances_org_branch_item`; không lock |

## Definition of done
- [x] AC-36..AC-39 có bằng chứng trong `07-verification.md`
- [x] Ảnh chụp `/orders/dispatch` + `/orders/all`: đơn thiếu có badge vàng "Thiếu hàng", đơn đủ không (chuyển từ T-08-05; chụp gộp với UOW-09/10)
- [x] Response `POST /v2/partner/orders` không đổi hình dạng (so với snapshot OpenAPI trước ticket)
- [x] `pnpm --filter @erp/api test` xanh
