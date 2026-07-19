# TKT-FSW-02 OpenAPI regen + FE type

## Epic

[EPIC-19072026 Chuyển quỹ — cho phép bỏ tự động sinh phiếu thu tiền mặt](../epics/EPIC-19072026-fund-swap-optional-receipt.md)

## Summary

`CreateFundSwapBody` (FE, `bank-vouchers.types.ts`) cần thêm `autoCreateReceipt?: boolean` khớp DTO backend. Regen OpenAPI snapshot theo convention repo.

## Deliverables

- `apps/backoffice-web/src/pages/treasury/bank-vouchers.types.ts` — thêm field vào `CreateFundSwapBody`.
- `packages/api-client/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` — regen.

## Acceptance Criteria

- [ ] `CreateFundSwapBody.autoCreateReceipt?: boolean` — comment ngắn giải thích chỉ áp dụng DEPOSIT_TO_CASH (khớp DTO backend).
- [ ] Snapshot phản ánh đúng field mới trên `POST /fund-swaps`.

## Definition of Done

- [ ] API chạy `:4000` với code TKT-FSW-01, chạy `pnpm openapi:generate`, commit cả 2 file.
- [ ] `pnpm --filter @erp/api-client build` pass.
- [ ] `pnpm --filter @erp/backoffice-web build` pass sau khi thêm type FE.

## Tech Approach

```ts
// bank-vouchers.types.ts
export interface CreateFundSwapBody {
  direction: FundSwapDirection;
  depositAccountId: string;
  cashAccountId?: string;
  amount: number;
  docDate: string;
  feeAmount?: number;
  reason?: string;
  /** DEPOSIT_TO_CASH only — false skips auto-creating the matching cash receipt. */
  autoCreateReceipt?: boolean;
}
```

## Testing Strategy

Không có test tự động — verify bằng build.

## Dependencies

- Depends on: [TKT-FSW-01](./TKT-FSW-01-service-dto.md)
- Blocks: [TKT-FSW-03](./TKT-FSW-03-payment-dialog-checkbox.md), [TKT-FSW-04](./TKT-FSW-04-fund-swap-dialog-checkbox.md)
