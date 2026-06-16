# TKT-DUE-05 openapi:generate + api-client snapshot

## Epic

[EPIC-16062026 POS công nợ — Hạn thanh toán](../epics/EPIC-16062026-pos-debt-due-date.md)

## Summary

Sau khi BE đổi DTO/endpoint (TKT-DUE-02 checkout `dueDate`/`creditDays`, TKT-DUE-03 org pos-settings), chạy `pnpm openapi:generate` và commit snapshot + generated client để FE dùng type chuẩn.

## Deliverables

- Chạy API (`:4000`) rồi `pnpm openapi:generate`.
- Commit `apps/api/openapi.snapshot.json` (cập nhật) + `packages/api-client/src/generated/schema.ts` (regenerated — **không** sửa tay).

## Acceptance Criteria

- [ ] `CheckoutInvoiceDto` mới (`dueDate`, `creditDays`) xuất hiện trong schema generated.
- [ ] Endpoint org pos-settings (GET + PATCH) xuất hiện trong schema generated.
- [ ] Diff snapshot chỉ chứa thay đổi của epic này (không drift ngoài ý muốn).

## Definition of Done

- [ ] `packages/api-client` build sạch sau regen.
- [ ] Không hand-edit file generated.
- [ ] Snapshot + schema commit cùng nhau.

## Tech Approach

```bash
make dev-api            # API :4000
pnpm openapi:generate   # regen packages/api-client từ /docs-json
```

## Testing Strategy

- `pnpm --filter @erp/api-client build` xanh.
- Type-check FE ở các ticket sau dùng client mới.

## Dependencies

- Depends on: TKT-DUE-02, TKT-DUE-03.
- Blocks: TKT-DUE-06, TKT-DUE-07.
