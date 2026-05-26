# TKT-2405-04 Checkout auto-resolve revenue + payment validation + DTO change

## Epic

[EPIC2405 payment_accounts + auto-resolve revenueAccountId](../EPIC2405.md)

## Layer

🟦 Backend only.

## Summary

Wire `CheckoutInvoiceService`: resolve `revenueAccountId` server-side + `validatePaymentLines` **trước** transaction; gỡ `revenueAccountId` khỏi `CheckoutInvoiceDto`. Đây là phần fix tận gốc lỗi `Account f29226ef... not found` (chuyển từ lỗi async DLQ → 400 đồng bộ) và ngừng tin FE chọn tài khoản doanh thu.

## Deliverables

- `apps/api/src/modules/pos/services/checkout-invoice.service.ts`:
  - Inject `DefaultAccountResolverService` + `PaymentAccountService`.
  - Trước `dataSource.transaction` (gần chỗ `documentNumberingService.generate`, dùng `invoice.branchId`):
    - `const revenueAccountId = await this.defaultAccountResolver.resolveRevenueAccountId(actor.organizationId, invoice.branchId);`
    - `if (dto.payments.length > 0) await this.paymentAccountService.validatePaymentLines(dto.payments, actor.organizationId, invoice.branchId!);`
  - Thay `dto.revenueAccountId` ở `journalSalePublisher.publish` (~line 209) và `contraAccountId` của `cashFromPaymentPublisher.publish` (~line 241) bằng `revenueAccountId` đã resolve.
- `apps/api/src/modules/pos/dto/checkout-invoice.dto.ts` — **xóa** field `revenueAccountId` (giữ `receivableAccountId?`).
- Cập nhật `checkout-invoice.service.spec.ts`.

## Acceptance Criteria

- [ ] Checkout **không** nhận `revenueAccountId`; vì `ValidationPipe` có `forbidNonWhitelisted`, gửi field thừa → 400.
- [ ] Revenue lấy từ resolver (branch→org); dòng Có bút toán + `contraAccountId` cash đều dùng id resolved.
- [ ] Payment line `accountId` không thuộc whitelist → **400 đồng bộ tại checkout** (không tạo invoice, không rơi DLQ).
- [ ] Resolver chưa cấu hình revenue cho branch → 400.
- [ ] Route `/invoices/:id/debt` (dùng chung DTO) cũng tự áp dụng (không còn `revenueAccountId`).
- [ ] Shape payload của publisher/consumer **không đổi** — id resolved vẫn đi trong Kafka payload; idempotency `findBySourceRef` nguyên vẹn (resolve/validate là read trước TX).

## Definition of Done

- [ ] PR service + dto; build pass.
- [ ] `checkout-invoice.service.spec.ts`: bỏ `revenueAccountId` khỏi DTO factory; mock `DefaultAccountResolverService` (trả `REVENUE_ACCOUNT`) + `PaymentAccountService` (`validatePaymentLines` resolve) vào providers; giữ assertion journal/cash contra = resolved; thêm 2 case 400 (resolver chưa cấu hình, line ngoài whitelist).
- [ ] `journal-sale.publisher.spec.ts` / `journal-sale.consumer.spec.ts` chạy lại xanh (không đổi).

## Tech Approach

- Dùng `invoice.branchId` (authoritative), **không** `actor.branchId`.
- Resolve + validate là read trước transaction nên không ảnh hưởng tính idempotent của checkout.

## Dependencies

- Requires: TKT-2405-02, TKT-2405-03.
- Cần TKT-2405-05 (seed) để verify end-to-end.
- Blocks: TKT-2405-06/07 (FE chạy thật cần DTO mới + endpoint).
