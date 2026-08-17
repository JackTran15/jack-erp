---
id: UOW-03
slug: cancel-split-return
title: Huỷ phiếu trả đã tách hoàn nguyên đúng cả hai chân
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-17, AC-18]
risk: high
status: todo
rollback: revert cancel-return.service; phiếu tách chưa huỷ không bị ảnh hưởng
---

# UOW-03 — Huỷ phiếu trả đã tách

Hai giả định của `cancel-return.service` bị chính UOW-01 làm sai:

- `restoreOriginalDebt` thoát ngay khi `invoice.refundMethod !== OFFSET` (L324) → phiếu
  tách mang `refundMethod = CASH` sẽ **không** trả lại công nợ đã cấn.
- `buildCollectionLegs` thu lại `refundedAmount` (L414) → huỷ một phiếu tách sẽ đòi khách
  765.000 trong khi chỉ mới chi cho họ 300.000.

Không có lát này, bản vá lỗi mất tiền tự tạo ra một lỗ mất tiền mới ở đường huỷ.

## Demo script

1. Dựng phiếu trả tách theo demo UOW-01 (cấn 465.000, chi 300.000); ghi lại số dư công nợ = 0
2. `POST /invoices/:returnId/cancel` với lý do bất kỳ
3. `psql` — `invoice_debts` hoá đơn gốc: `remaining_amount` trở lại 465.000, `status = open`,
   `settled_at` về NULL
4. `psql` — chứng từ thu lại tiền của khách: đúng **300.000**
5. Lặp với phiếu cấn trừ toàn phần (chi 0) → công nợ khôi phục đủ, **không** chứng từ thu nào

## In scope

- `restoreOriginalDebt` không còn phụ thuộc `refundMethod`
- `buildCollectionLegs` thu lại `refundedAmount − offsetAmount`

## Not in scope

- Huỷ **hoá đơn bán** (`cancel-invoice.service`) — Akenzy chốt để feature riêng (A-04)

## Risks

| Risk | Mitigation |
|---|---|
| Huỷ hai lần cộng dồn công nợ | Giữ nguyên cơ chế dựa trên dòng ADJUSTMENT (đã idempotent theo `invoiceId`) và test ca huỷ lặp |
| Khách đã trả thêm nợ sau khi phiếu trả cấn trừ | Cộng/trừ tương đối trên `paidAmount` như hiện tại, không gán tuyệt đối — test ca này |

## Definition of done

- [x] AC-17, AC-18 pass
- [x] Không còn nhánh nào ở `cancel-return` đọc `refundMethod === OFFSET`
- [x] Huỷ hai lần không làm công nợ sai
- [ ] Demoed và accepted at gate G4
