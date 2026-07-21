# TKT-CTF-04 `FundSwapsService` — cho bỏ tick sinh phiếu thu ở chiều `CASH_TO_DEPOSIT`

## Epic

[EPIC-21072026 Phiếu chi tiền mặt — chuyển thành tiền gửi & chuyển đến cửa hàng khác](../epics/EPIC-21072026-cash-transfer-vouchers.md)

## Summary

Chiều `DEPOSIT_TO_CASH` đã cho bỏ tick "Tự động sinh phiếu thu" từ [EPIC-19072026](../epics/EPIC-19072026-fund-swap-optional-receipt.md); chiều ngược lại vẫn ném 400. Ticket này làm nốt cho đối xứng: bỏ tick ở "Chuyển tiền mặt thành tiền gửi" → chỉ sinh phiếu chi tiền mặt, tiền treo ở TK 113, kế toán tự tạo phiếu thu tiền gửi sau khi ngân hàng báo có.

> **Thay thế** ràng buộc cũ ở [TKT-FSW-01](./TKT-FSW-01-service-dto.md) (AC "CASH_TO_DEPOSIT + autoCreateReceipt=false → BadRequestException"). Ràng buộc đó là quyết định tạm thời của epic trước, nay bỏ.

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/fund-swaps/fund-swaps.service.ts` — gỡ guard, thêm early-return ở nhánh `CASH_TO_DEPOSIT`.
- `apps/api/src/modules/accounting/deposit-vouchers/fund-swaps/dto/create-fund-swap.dto.ts` — cập nhật mô tả Swagger (không còn "DEPOSIT_TO_CASH only").
- `apps/api/src/modules/accounting/deposit-vouchers/fund-swaps/fund-swaps.service.spec.ts` — sửa ca test cũ + thêm ca mới.

## Acceptance Criteria

- [ ] `direction=CASH_TO_DEPOSIT, autoCreateReceipt=false` → chỉ gọi `cashPayment.createAndPostInternal`, **không** gọi `bankReceipt.createAndPostInternal`; kết quả chỉ có `cashPaymentId`, `bankReceiptId` là `undefined`.
- [ ] `direction=CASH_TO_DEPOSIT` với `autoCreateReceipt=true` hoặc bỏ trống → hành vi y hệt trước ticket (2 chân atomic), không hồi quy.
- [ ] `direction=DEPOSIT_TO_CASH` mọi tổ hợp → không đổi gì so với hiện tại.
- [ ] `BadRequestException('autoCreateReceipt only applies to DEPOSIT_TO_CASH')` bị xoá hẳn, không còn nhánh chết.
- [ ] Mô tả Swagger của `autoCreateReceipt` nói rõ áp dụng cho **cả 2 chiều**, mặc định `true` (tương thích ngược với mọi caller cũ).
- [ ] Ca test cũ đang assert 400 được **sửa** thành assert chỉ-1-chân, không xoá bỏ im lặng.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- fund-swaps` pass, gồm cả ca cũ đã sửa.
- [ ] `pnpm --filter @erp/api build` + `lint` pass.
- [ ] Không đổi schema/migration.
- [ ] Không có tiếng Việt trong source backend.

## Tech Approach

```ts
// swap() — bỏ hẳn khối guard ở đầu hàm:
// if (dto.direction === FundSwapDirection.CASH_TO_DEPOSIT && dto.autoCreateReceipt === false) {
//   throw new BadRequestException('autoCreateReceipt only applies to DEPOSIT_TO_CASH');
// }

// … nhánh CASH_TO_DEPOSIT, sau khi tạo cashPayment:
if (dto.autoCreateReceipt === false) {
  // Leg 2 deliberately skipped — the amount sits in TK 113 "Tiền đang chuyển"
  // until the bank confirms the deposit and the accountant records it as a
  // separate deposit receipt. Mirrors the DEPOSIT_TO_CASH branch.
  return { cashPaymentId: cashPayment.voucherId };
}

const bankReceipt = await this.bankReceipt.createAndPostInternal({ /* nguyên vẹn */ }, manager);
return { cashPaymentId: cashPayment.voucherId, bankReceiptId: bankReceipt.voucherId };
```

`FundSwapResult.bankReceiptId` đã là optional sẵn — không cần đổi type.

## Testing Strategy

Unit (`fund-swaps.service.spec.ts`):
- `CASH_TO_DEPOSIT` + `autoCreateReceipt=false` → `bankReceipt.createAndPostInternal` KHÔNG được gọi; kết quả không có `bankReceiptId`.
- `CASH_TO_DEPOSIT` + `autoCreateReceipt=true` → cả 2 chân (hồi quy).
- `CASH_TO_DEPOSIT` bỏ trống field → cả 2 chân (mặc định `true`).
- Ca cũ `rejects.toThrow(BadRequestException)` → viết lại thành ca chỉ-1-chân ở trên.
- `DEPOSIT_TO_CASH` các ca cũ → giữ nguyên, phải vẫn xanh.

## Dependencies

- Depends on: — (độc lập với CTF-01..03, chạy song song được)
- Blocks: [TKT-CTF-05](./TKT-CTF-05-openapi-fe-types-hooks.md)
