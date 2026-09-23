---
id: UOW-07
slug: cancel-and-rollback
title: Huỷ đơn — tồn, điểm và công nợ tự quay về như trước khi bán
demoable: true
duration: 1.5d
depends_on: [UOW-05]
requirements: [US-06]
verifies: [AC-23, AC-24]
risk: medium
status: todo
rollback: revert nút + phần gọi CancelInvoiceService; đơn đã huỷ KHÔNG hoàn tác được — đó là bản chất của huỷ, không phải thiếu sót
---

# UOW-07 — Huỷ đơn và rollback

## Demo script
1. **Ca chưa có hoá đơn:** đơn trong pool → huỷ kèm lý do → `status = CANCELLED`, `cancel_reason` có; Adminer: không bút toán kho nào phát sinh
2. **Ca đã phát hành hoá đơn:** ghi lại trước khi huỷ — tồn `SKU-500` tại Hồ Chí Minh = N, điểm khách = P, công nợ COD OPEN 1.030.000
3. Huỷ đơn đó kèm lý do
4. Adminer sau khi huỷ:
   - tồn `SKU-500` tại Hồ Chí Minh = **N trở lại**
   - `stock_ledger` có bút toán đảo reference type `INVOICE_CANCEL` ("Huỷ hoá đơn bán hàng")
   - điểm khách = **P trở lại**
   - `invoice_debts` không còn OPEN
   - `invoices.status = CANCELLED`, **các cột tiền của hoá đơn không đổi một đồng**
   - `sales_orders.status = CANCELLED`
5. **Ca bị chặn:** đơn đã có trả hàng tất toán → huỷ bị từ chối, không đảo gì

## In scope
- `SalesOrderService.cancel()` gọi `CancelInvoiceService.cancel()` khi đơn có hoá đơn
- Nút huỷ + lý do trên cả ba màn
- e2e chứng minh rollback bằng số trước/sau

## Not in scope
- Nới bất kỳ chặn nào của `CancelInvoiceService` (ADR-06)
- Khách tự huỷ trên web (A-11, A-14)

## Risks
| Risk | Mitigation |
| --- | --- |
| Viết đường đảo mới thay vì gọi lại đường có sẵn ⇒ sửa hoá đơn đã phát hành, vi phạm bất biến | ADR-06 là ràng buộc; T-07-01 chỉ được gọi, không được tự đảo |
| Huỷ đơn mà hoá đơn không huỷ được (ngoài `CANCELLABLE_STATUSES`) ⇒ đơn CANCELLED còn hoá đơn sống | Cả hai trong **một** transaction; hoá đơn từ chối thì đơn cũng không đổi |
| Điểm tích: `pointsEarned` bị claw back trong khi `pointsRedeemed` phải trả lại — hai chiều ngược nhau, dễ lẫn | `CancelInvoiceService` đã xử đúng và có comment giải thích; đừng tính lại, chỉ kiểm bằng số trước/sau |

## Definition of done
- [x] AC-23, AC-24 có bằng chứng số trước/sau trong `07-verification.md` — mục T-07-03 (Jest e2e 2/2, 2026-09-22) + `run_flow.py` 50/0
- [x] Không có dòng code nào sửa `invoices` của hoá đơn đã phát hành ngoài `CancelInvoiceService`
- [ ] `pnpm --filter @erp/api test` + e2e xanh
