# TKT-DFR-07 OpenAPI regen + snapshot (GĐ3 endpoints)

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

Sau khi DFR-02..06 thêm/đổi endpoint (đối chiếu, balance book/available, hoàn tiền/đảo, khóa sổ, audit-log), chạy `pnpm openapi:generate` (API phải chạy trên :4000) rồi commit `openapi.snapshot.json` + generated `packages/api-client/src/generated/schema.ts` để FE (DFR-08) consume qua `@erp/api-client` typed. Không hand-edit file generated.

## Deliverables

- `apps/api/openapi.snapshot.json` — regenerated snapshot chứa các path GĐ3:
  - `GET /deposit-recon`, `POST /deposit-recon/reconcile`, `POST /deposit-recon/unreconcile`, `GET /deposit-recon/export` (DFR-02).
  - `GET /deposit-period-locks`, `POST /deposit-period-locks`, `POST /deposit-period-locks/:id/unlock` (DFR-06).
  - `GET /deposit-audit-log` (DFR-06).
  - Balance book/available trên deposit-ledger response (DFR-04).
- `packages/api-client/src/generated/schema.ts` — regenerated types (không hand-edit).

## Acceptance Criteria

- [ ] `pnpm openapi:generate` chạy với API live (:4000) — không thủ công sửa output.
- [ ] Snapshot chứa **mọi** endpoint mới GĐ3 + DTO (ReconcileDto, UnreconcileDto, ListReconDto, LockPeriodDto, response balance có `bookBalance`/`availableBalance`/`pendingClearingAmount`, recon row có `valueDate`/`netAmount`/`feeAmount`/`bankRefCode`/`discrepancyNote`).
- [ ] `pnpm build:shared` (build `@erp/api-client`) xanh sau regen — types compile.
- [ ] Không hand-edit `schema.ts`; diff chỉ do generator.
- [ ] Không endpoint GĐ1/GĐ2 nào bị mất khỏi snapshot (regen bao trùm, không cắt).

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `pnpm build:shared` xanh.
- [ ] `openapi.snapshot.json` + `schema.ts` committed cùng nhau.
- [ ] Không hand-edit file generated.
- [ ] Không tiếng Việt trong backend source / DTO (chỉ ticket prose).

## Tech Approach

```bash
make dev-api                 # API :4000 (rebuild shared trước)
pnpm openapi:generate        # ghi openapi.snapshot.json + packages/api-client/src/generated/schema.ts
pnpm build:shared            # verify @erp/api-client compile
```

Theo CLAUDE.md: "After changing API endpoints: run the API, then `pnpm openapi:generate`. Commit the updated `openapi.snapshot.json` and generated `schema.ts` (do not hand-edit)."

## Testing Strategy

- Không unit test. Verify: grep snapshot chứa `/deposit-recon`, `/deposit-period-locks`, `/deposit-audit-log`; `bookBalance` + `availableBalance` trong component schema; `pnpm build:shared` compile.

## Dependencies

- Depends on: TKT-DFR-02, TKT-DFR-03, TKT-DFR-04, TKT-DFR-05, TKT-DFR-06 (mọi endpoint đã land).
- Blocks: TKT-DFR-08 (FE consume typed client).
