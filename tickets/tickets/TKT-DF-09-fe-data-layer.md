# TKT-DF-09 FE data layer — deposit hooks + query keys

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Nền tảng](../epics/EPIC-15072026-deposit-fund-foundation.md)

## Summary

Tầng data FE cho quỹ tiền gửi trong backoffice-web: TanStack Query hooks + query keys, over `erpApi` /
`requireErpData` (auto inject `Authorization` / `X-Branch-Id` / `X-Idempotency-Key`). Mirror hooks tiền mặt
(`use-cash-accounts.ts`, `use-cash-ledger.ts`). Chỉ tầng dữ liệu — page/UI ở DF-10. Depend on client đã regen (DF-08)
để type deposit có sẵn.

## Deliverables

- `apps/backoffice-web/src/hooks/treasury/use-deposit-accounts.ts` — list/create/update/delete `deposit_accounts` (qua generic CRUD endpoint hoặc `@erp/api-client`).
- `apps/backoffice-web/src/hooks/treasury/use-deposit-payment-policy.ts` — list/create/update/delete `deposit_payment_policy`.
- `apps/backoffice-web/src/hooks/treasury/use-deposit-ledger.ts` — `GET /deposit-ledger` (mirror `use-cash-ledger.ts`) + export.
- `apps/backoffice-web/src/hooks/treasury/use-banks.ts` — danh mục ngân hàng (cho dropdown chọn ngân hàng khi tạo tài khoản).
- `apps/backoffice-web/src/hooks/treasury/treasury-query-keys.ts` — extend thêm namespace deposit key.

## Acceptance Criteria

- [ ] Hooks wrap TanStack Query; queryKey array bắt đầu bằng tên resource + mọi filter: `['deposit-accounts', ...]`, `['deposit-ledger', depositAccountId, dateFrom, dateTo, page]`, `['deposit-payment-policy', ...]`, `['banks', ...]`.
- [ ] Read qua `requireErpData(...)` (throw `HttpError` khi API lỗi); mutation qua `erpApi` (auto `X-Idempotency-Key`); void endpoint qua `requireErpSuccess`.
- [ ] Import type từ `@erp/shared-interfaces` / `@erp/api-client` (DF-02/08) — **không** tự định nghĩa lại DTO/enum trong FE.
- [ ] Invalidate theo prefix: sau create/update/delete tài khoản → invalidate `['deposit-accounts']`; đổi payment policy → `['deposit-payment-policy']`; không đụng dữ liệu server trong Zustand (chỉ TanStack Query).
- [ ] `treasury-query-keys.ts` có deposit keys, không trùng/đè cash keys.
- [ ] Ledger hook truyền `depositAccountId`/`dateFrom`/`dateTo`/`page`; `X-Branch-Id` auto-inject → dữ liệu scope theo chi nhánh đang chọn (UAT-13).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh (typecheck với client mới).
- [ ] `pnpm --filter @erp/backoffice-web lint` xanh (echo lint theo repo).
- [ ] Không tự định nghĩa lại type đã có trong shared/api-client.
- [ ] Server data không nằm trong Zustand.
- [ ] Không có TODO/FIXME ngoài kế hoạch.

## Tech Approach

Mirror `apps/backoffice-web/src/hooks/treasury/use-cash-ledger.ts` + `use-cash-accounts.ts`. `erpApi`/`requireErpData`
từ `lib/erp-api.ts`.

```ts
// use-deposit-ledger.ts
export function useDepositLedger(params: { depositAccountId?: string; dateFrom?: string; dateTo?: string; page: number }) {
  return useQuery({
    queryKey: treasuryKeys.depositLedger(params),
    enabled: !!params.depositAccountId && !!params.dateFrom && !!params.dateTo,
    queryFn: () => requireErpData(erpApi.GET('/deposit-ledger', { params: { query: params } })),
  });
}

// use-deposit-accounts.ts (generic CRUD)
export function useDepositAccounts(filters) {
  return useQuery({ queryKey: treasuryKeys.depositAccounts(filters), queryFn: () => requireErpData(/* /admin/entities/deposit_accounts/records */) });
}
export function useCreateDepositAccount() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto) => requireErpData(/* POST */), onSuccess: () => qc.invalidateQueries({ queryKey: ['deposit-accounts'] }) });
}
```

```ts
// treasury-query-keys.ts (extend)
export const treasuryKeys = {
  ...existing,
  depositAccounts: (f?: object) => ['deposit-accounts', f] as const,
  depositPaymentPolicy: (f?: object) => ['deposit-payment-policy', f] as const,
  depositLedger: (p: object) => ['deposit-ledger', p] as const,
  banks: (f?: object) => ['banks', f] as const,
};
```

Nếu deposit_accounts/deposit_payment_policy đi qua generic CRUD `/admin/entities/:entityKey/records`, hooks có thể reuse
`useCrudRecords`/`useCrudCreate` (`useCrudConfig` platform) thay vì viết tay — chọn hướng dùng lại nhiều nhất; ledger
là endpoint custom nên viết tay hook.

## Testing Strategy

- Verification chính: build/typecheck FE với client regen. Web app repo echo `test`/`lint` → không unit runtime; đảm bảo hook compile + queryKey đúng shape.
- Hành vi thật verify khi ráp page ở DF-10 (screenshot flow) + E2E BE ở DF-11.

## Dependencies

- Depends on: TKT-DF-08 (api-client regen — type deposit có sẵn).
- Blocks: TKT-DF-10 (page dùng hooks).
