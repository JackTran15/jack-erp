# TKT-MRC-02 OpenAPI regen + FE types cho `groups[]`

## Epic

[EPIC-21072026 Đối chiếu tiền gửi — nhiều tài khoản](../epics/EPIC-21072026-multi-account-deposit-reconcile.md)

## Summary

Đồng bộ snapshot OpenAPI sau khi `ReconcileDto` đổi shape, và cập nhật type hand-rolled phía backoffice (`deposit-recon.types.ts` mirror DTO backend theo pattern `bank-vouchers.types.ts`).

## Deliverables

- `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` — sinh bằng `pnpm openapi:generate` khi API chạy, không sửa tay.
- `apps/backoffice-web/src/pages/treasury/deposit-recon/deposit-recon.types.ts` — `ReconcileGroupBody`, `ReconcileBody`, `ReconcileGroupResult`, `ReconcileResponse`.
- `apps/backoffice-web/src/hooks/treasury/use-deposit-recon.ts` — chỉ đổi generic type của mutation.

## Acceptance Criteria

- [ ] `ReconcileBody = { groups: ReconcileGroupBody[]; stmtFromDate: string; stmtToDate: string }`.
- [ ] `ReconcileResponse = { results: ReconcileGroupResult[] }`, trong đó `ReconcileGroupResult` = shape cũ (`batch`, `systemTotalAmount`, `diffAmount`, `status`, `proposalId?`).
- [ ] `useDepositReconMutations().reconcile` vẫn gọi `erpApi.POST("/deposit-recon/reconcile")`, không đổi cache invalidation.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh (typecheck).
- [ ] Snapshot OpenAPI đã commit.

## Dependencies

- Depends on: TKT-MRC-01.
- Blocks: TKT-MRC-03.
