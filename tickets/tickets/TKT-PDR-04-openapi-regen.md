# TKT-PDR-04 BE: openapi:generate + commit snapshot

## Epic

[EPIC-27072026 Báo cáo theo ngày (POS Daily Report)](../epics/EPIC-27072026-pos-daily-report.md)

## Summary

Sau khi có route `POST /reports/pos/daily-summary` (TKT-PDR-03) và cột `unitPrice` (TKT-PDR-02), regenerate api-client để FE dùng type sinh sẵn.

## Deliverables

- Chạy API (`make dev-api`) rồi `pnpm openapi:generate`.
- Commit `packages/api-client/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (KHÔNG hand-edit file generated).

## Acceptance Criteria

- [ ] `schema.ts` chứa path `/reports/pos/daily-summary` với request/response type khớp `PosDailySummaryResult`.
- [ ] Diff snapshot chỉ gồm thay đổi liên quan (endpoint mới; `revenue-by-item` columns lấy từ data nên có thể không đổi schema).
- [ ] `pnpm --filter @erp/api-client build` xanh.

## Definition of Done

- [ ] Snapshot + schema committed, không hand-edit.
- [ ] FE có thể import type mới.

## Tech Approach

```bash
make dev-api            # đảm bảo /docs-json cập nhật
pnpm openapi:generate   # regenerate packages/api-client
```

## Testing Strategy

- Build api-client; smoke import type ở FE (TKT-PDR-05).

## Dependencies

- Depends on: TKT-PDR-02, TKT-PDR-03
- Blocks: TKT-PDR-05
