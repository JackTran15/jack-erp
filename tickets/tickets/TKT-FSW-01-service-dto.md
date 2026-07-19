# TKT-FSW-01 CreateFundSwapDto + FundSwapsService — autoCreateReceipt optional

## Epic

[EPIC-19072026 Chuyển quỹ — cho phép bỏ tự động sinh phiếu thu tiền mặt](../epics/EPIC-19072026-fund-swap-optional-receipt.md)

## Summary

Thêm field optional `autoCreateReceipt` vào `CreateFundSwapDto`. Khi `false` **và** `direction=DEPOSIT_TO_CASH`, `FundSwapsService.swap()` chỉ tạo chân rút quỹ tiền gửi (bank_payment, contra TK 113), bỏ qua chân tạo `cash_receipts`. Mặc định (bỏ trống hoặc `true`) giữ nguyên hành vi atomic 2 chân như hiện tại.

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/fund-swaps/dto/create-fund-swap.dto.ts` — thêm field.
- `apps/api/src/modules/accounting/deposit-vouchers/fund-swaps/fund-swaps.service.ts` — sửa nhánh `DEPOSIT_TO_CASH`.
- `apps/api/src/modules/accounting/deposit-vouchers/fund-swaps/fund-swaps.service.spec.ts` — thêm ca kiểm thử.

## Acceptance Criteria

- [ ] `autoCreateReceipt` là optional boolean, mặc định coi như `true` khi bỏ trống (tương thích ngược 100% với mọi request cũ không gửi field này).
- [ ] `direction=DEPOSIT_TO_CASH, autoCreateReceipt=false`: chỉ gọi `bankPayment.createAndPostInternal` (WITHDRAWAL leg), **không** gọi `cashReceipt.createAndPostInternal`. `FundSwapResult` trả về chỉ có `bankPaymentId` (+ `bankFeePaymentId` nếu có phí) — `cashReceiptId` là `undefined` (field này đã optional sẵn, không cần đổi type).
- [ ] `direction=DEPOSIT_TO_CASH, autoCreateReceipt=true` (hoặc bỏ trống): hành vi y hệt trước ticket — cả 2 chân tạo, `cashReceiptId` có giá trị.
- [ ] `direction=CASH_TO_DEPOSIT, autoCreateReceipt=false`: ném `BadRequestException` rõ ràng ("autoCreateReceipt only applies to DEPOSIT_TO_CASH" hoặc tương đương) — **không** âm thầm bỏ qua field không hợp lệ cho chiều này.
- [ ] `direction=CASH_TO_DEPOSIT` không kèm `autoCreateReceipt` (trường hợp bình thường): không đổi gì, không validate thừa.
- [ ] Phí rút tiền (`feeAmount`, BR-SWP-03) vẫn hoạt động độc lập với `autoCreateReceipt` — bỏ tick sinh phiếu thu không ảnh hưởng gì đến việc có tính phí hay không.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- fund-swaps` pass, bao gồm ca mới.
- [ ] `pnpm --filter @erp/api lint` (no-op, vẫn chạy để xác nhận).
- [ ] Không đổi schema/migration.
- [ ] Không có tiếng Việt trong source backend (lỗi/comment/log).

## Tech Approach

```ts
// create-fund-swap.dto.ts
/**
 * DEPOSIT_TO_CASH only — when false, only the deposit-withdrawal leg posts
 * (money parks in TK 113 "Tiền đang chuyển"); the cashier creates a matching
 * cash receipt manually later, once counted. Omit or true = current atomic
 * 2-leg behavior (default, matches MISA's own toggle).
 */
@IsOptional()
@IsBoolean()
autoCreateReceipt?: boolean;
```

```ts
// fund-swaps.service.ts, swap()
if (dto.direction === FundSwapDirection.CASH_TO_DEPOSIT) {
  if (dto.autoCreateReceipt === false) {
    throw new BadRequestException(
      'autoCreateReceipt only applies to DEPOSIT_TO_CASH',
    );
  }
  // ... existing CASH_TO_DEPOSIT branch unchanged
}

if (dto.direction === FundSwapDirection.DEPOSIT_TO_CASH) {
  // ... existing leg 1 (withdrawal) + leg 1b (fee) unchanged

  if (dto.autoCreateReceipt === false) {
    return { bankPaymentId: bankPayment.voucherId, bankFeePaymentId: bankFeePayment?.voucherId };
  }

  // ... existing leg 2 (cash receipt) unchanged
  return { bankPaymentId: ..., bankFeePaymentId: ..., cashReceiptId: cashReceipt.voucherId };
}
```

Đặt validate `CASH_TO_DEPOSIT + autoCreateReceipt=false` ở **đầu** `swap()` (trước khi mở transaction) — fail nhanh, không mở transaction cho lỗi validate.

## Testing Strategy

Unit (`fund-swaps.service.spec.ts`), mock `bankPayment`/`cashReceipt`/`cashFundResolver`:
- `autoCreateReceipt=false` + DEPOSIT_TO_CASH → `cashReceipt.createAndPostInternal` KHÔNG được gọi, kết quả không có `cashReceiptId`.
- `autoCreateReceipt=true` + DEPOSIT_TO_CASH → hành vi cũ (test hồi quy, tái dùng ca đã có).
- `autoCreateReceipt` bỏ trống + DEPOSIT_TO_CASH → hành vi cũ (mặc định `true`).
- `autoCreateReceipt=false` + CASH_TO_DEPOSIT → `rejects.toThrow(BadRequestException)`, không mutation nào được gọi.
- Phí rút tiền (`feeAmount`) + `autoCreateReceipt=false` → phí vẫn được tạo (`bankFeePaymentId` có giá trị), `cashReceiptId` vẫn không có.

## Dependencies

- Depends on: —
- Blocks: [TKT-FSW-02](./TKT-FSW-02-openapi-fe-type.md)
