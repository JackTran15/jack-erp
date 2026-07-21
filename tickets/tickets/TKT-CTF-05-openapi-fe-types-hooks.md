# TKT-CTF-05 OpenAPI regen + FE types & hooks

## Epic

[EPIC-21072026 Phiếu chi tiền mặt — chuyển thành tiền gửi & chuyển đến cửa hàng khác](../epics/EPIC-21072026-cash-transfer-vouchers.md)

## Summary

Sinh lại api-client sau khi có 5 endpoint `/cash-transfers`, mirror enum mới sang FE, và thêm hook TanStack Query cho toàn bộ vòng đời chuyển tiền mặt.

## Deliverables

- `apps/api/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` — regen, commit (không sửa tay).
- `apps/backoffice-web/src/pages/treasury/cash-vouchers.types.ts` — mirror `CashTransferFundKind` + giá trị enum mới của `CashPaymentPurpose`/`CashReceiptPurpose`/`*ReferenceType`.
- `apps/backoffice-web/src/hooks/treasury/use-cash-transfers.ts` (mới).
- `apps/backoffice-web/src/hooks/treasury/treasury-query-keys.ts` — key cho `cashTransfers`.

## Acceptance Criteria

- [ ] Chạy API rồi `pnpm openapi:generate`; commit cả `openapi.snapshot.json` và `schema.ts`. Không sửa tay file generated.
- [ ] Diff của `schema.ts` chỉ chứa phần `/cash-transfers` + `autoCreateReceipt` (mô tả đổi) — nếu lẫn thay đổi lạ thì API đang chạy sai nhánh, dừng lại xử lý trước.
- [ ] `cash-vouchers.types.ts` mirror đủ giá trị enum mới, đúng cách file đó đang mirror enum backend (không import từ `@erp/shared-interfaces` nếu enum không nằm ở đó).
- [ ] `use-cash-transfers.ts` cung cấp: `useCashTransfers(query)`, `useCashTransfer(id, enabled)`, `useCreateCashTransfer()`, `useConfirmCashTransfer()`, `useCancelCashTransfer()` — mirror `use-deposit-transfers.ts`.
- [ ] Mọi hook đi qua `erpApi` + `requireErpData`/`requireErpSuccess`, không gọi `fetch`/`axios` trực tiếp.
- [ ] Query key bắt đầu bằng tên resource và chứa đủ filter: `["cash-transfers", status, direction, page, pageSize]`; mutation invalidate theo prefix `["cash-transfers"]` **và** các key quỹ tiền mặt / tiền gửi bị ảnh hưởng (`cash-vouchers`, `cash-ledger`, `deposit-*`) — đúng cách `use-deposit-transfers.ts` đang làm.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` (API chạy được để generate).
- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] `pnpm build:shared` pass.
- [ ] Snapshot đã commit **trước** khi bắt đầu CTF-06/CTF-07.

## Tech Approach

```bash
# API phải đang chạy trên :4000
make dev-api
pnpm openapi:generate
git add apps/api/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

```ts
// use-cash-transfers.ts — mirror use-deposit-transfers.ts
export function useCashTransfers(query: CashTransferListQuery) {
  return useQuery({
    queryKey: treasuryKeys.cashTransfers(query),
    queryFn: () => requireErpData(erpApi.GET("/cash-transfers", { params: { query } })),
  });
}

export function useConfirmCashTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      requireErpData(erpApi.POST("/cash-transfers/{id}/confirm", {
        params: { path: { id } }, body: { note },
      })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-transfers"] });
      qc.invalidateQueries({ queryKey: ["cash-vouchers"] });
      qc.invalidateQueries({ queryKey: ["deposit-vouchers"] });
    },
  });
}
```

## Testing Strategy

Không unit test. Xác minh bằng build FE + gọi thử 1 request từ trang mới ở [TKT-CTF-07](./TKT-CTF-07-cash-transfer-page.md).

## Dependencies

- Depends on: [TKT-CTF-03](./TKT-CTF-03-controller-permissions.md), [TKT-CTF-04](./TKT-CTF-04-fund-swap-optional-receipt-cash.md)
- Blocks: [TKT-CTF-06](./TKT-CTF-06-payment-dialog-submodes.md), [TKT-CTF-07](./TKT-CTF-07-cash-transfer-page.md)
