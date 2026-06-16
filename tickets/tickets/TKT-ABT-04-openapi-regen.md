# TKT-ABT-04 OpenAPI regen + commit api-client snapshot

## Epic

[EPIC-16062026 Active branch trong token](../epics/EPIC-16062026-active-branch-token.md)

## Layer

🟫 Tooling (api-client generation).

## Summary

Sau khi có endpoint mới `POST /auth/switch-branch`, chạy lại generator để `@erp/api-client` có type/path cho endpoint, rồi commit snapshot. FE (TKT-ABT-05/06) phụ thuộc client đã regen.

## Deliverables

- Chạy API (`make dev-api`) rồi `pnpm openapi:generate`.
- Commit:
  - `packages/api-client/openapi.snapshot.json` (cập nhật path `/auth/switch-branch` + `SwitchBranchDto`).
  - `packages/api-client/src/generated/schema.ts` (generated — **không** sửa tay).

## Acceptance Criteria

- [ ] `schema.ts` chứa path `/auth/switch-branch` (request body `branchId`, response token + session).
- [ ] Diff snapshot chỉ gồm endpoint mới (không drift endpoint khác).
- [ ] `pnpm --filter @erp/api-client build` xanh.

## Definition of Done

- [ ] `openapi.snapshot.json` + `schema.ts` commit cùng nhau; file generated không bị chỉnh tay.
- [ ] FE import được path mới qua `erpApi`.

## Tech Approach

- API phải chạy ở `:4000`; generator đọc `/docs-json`. Nếu `DISABLE_SWAGGER=1`/`NODE_ENV=production` thì docs tắt → bật dev mode trước khi generate.

## Dependencies

- Requires: TKT-ABT-03 (endpoint đã có trong Swagger).
- Blocks: TKT-ABT-05, TKT-ABT-06.
