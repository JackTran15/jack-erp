---
id: UOW-03
slug: block-wrong-type-checkout
title: Backend từ chối tất toán phiếu đổi/trả qua luồng bán thường
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-03]
verifies: [AC-09, AC-10]
risk: low
status: todo
rollback: revert 1 commit — guard thuần, không đổi dữ liệu
---

# UOW-03 — Backend từ chối tất toán phiếu đổi/trả qua luồng bán thường

## Demo script

1. Tạo một phiếu nháp EXCHANGE (POST /invoices/exchanges qua Swagger `/docs`)
2. Gọi `POST /invoices/{id}/checkout` với một dòng thanh toán hợp lệ
3. Nhận 400 `INVOICE_NOT_CHECKOUTABLE`; kiểm DB: phiếu vẫn `is_draft = true`,
   `status = DRAFT`, `code` vẫn là `DRAFT-…` (không tiêu số chứng từ)
4. Lặp lại với một phiếu nháp SALE → tất toán bình thường

## In scope

- Guard `type === SALE` ở `checkout-invoice.service.ts` (v1) và `load-draft.step.ts` (saga v2)

## Not in scope

- Chặn `PATCH /invoices/:id` trên phiếu đổi/trả — sau guard này, sửa dòng của một draft
  đổi/trả không còn phát hành được thành hoá đơn sai, nên để nguyên cho đơn giản

## Risks

| Risk | Mitigation |
| --- | --- |
| Có luồng hợp lệ nào đó đang tất toán phiếu đổi/trả qua `/checkout` | Đã rà: `use-checkout-actions` chỉ gọi `/checkout` ở nhánh `!isReturnFlow`; nhánh đổi/trả luôn dùng `/checkout-return` |
| Replay idempotent bị guard chặn nhầm | Guard đặt cùng chỗ với kiểm `isDraft` hiện có, sau nhánh `isCompletedReplay` |

## Definition of done

- [x] AC-09, AC-10 pass
- [x] `pnpm --filter @erp/api test` xanh
- [x] Thông điệp lỗi bằng tiếng Anh, dùng đúng code `INVOICE_NOT_CHECKOUTABLE` sẵn có
- [x] Demo ở trên chạy được trên máy dev
