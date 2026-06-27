# TKT-TWD-06 openapi:generate + api-client snapshot

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Sau khi endpoint kho tạm đổi (active thêm `direction`, addLine đổi DTO, thay close bằng combined close), chạy `pnpm openapi:generate` và commit snapshot. Lưu ý: pos-web tiêu thụ kho tạm qua axios `http` + types `@erp/shared-interfaces` (không qua `@erp/api-client`), nên đây là bước giữ snapshot đồng bộ chứ không phải nguồn type cho FE.

## Deliverables

- `apps/api/openapi.snapshot.json` — regenerated.
- `packages/api-client/src/generated/schema.ts` — regenerated (không hand-edit).

## Acceptance Criteria

- [ ] API chạy `:4000`, `pnpm openapi:generate` thành công, diff chỉ phản ánh thay đổi kho tạm (active `direction` param, addLine body, `POST sessions/close`, mất `POST sessions/:id/close`).
- [ ] Commit cả `openapi.snapshot.json` + `schema.ts`.

## Definition of Done

- [ ] `pnpm build` xanh sau regen.
- [ ] Không hand-edit file generated.
- [ ] Snapshot commit kèm thay đổi BE (không để lệch).

## Tech Approach

```bash
make dev-api            # hoặc chạy API :4000
pnpm openapi:generate
git add apps/api/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

## Testing Strategy

- `pnpm build` toàn workspace sau regen.

## Dependencies

- Depends on: TKT-TWD-03, TKT-TWD-04
- Blocks: TKT-TWD-07
