# TKT-TWD-11 openapi:generate (addLine storage ids) + api-client snapshot

## Epic

[EPIC-25062026 Kho tạm theo hướng phiên](../epics/EPIC-25062026-temp-warehouse-session-direction.md)

## Summary

Sau khi `POST /inventory/temp-warehouse/lines` đổi body (bỏ `warehouseLocationId`/`showroomLocationId`, thêm `warehouseStorageId`/`showroomStorageId`), chạy `pnpm openapi:generate` và commit snapshot. pos-web tiêu thụ qua axios + `@erp/shared-interfaces` nên bước này giữ snapshot đồng bộ.

## Deliverables

- `packages/api-client/openapi.snapshot.json` — regenerated.
- `packages/api-client/src/generated/schema.ts` — regenerated (không hand-edit).

## Acceptance Criteria

- [ ] API chạy `:4000`, `pnpm openapi:generate` thành công; diff chỉ phản ánh addLine body (storage ids thay location ids).
- [ ] Commit cả `openapi.snapshot.json` + `schema.ts`.

## Definition of Done

- [ ] `pnpm build` xanh sau regen.
- [ ] Không hand-edit file generated.

## Tech Approach

```bash
pnpm openapi:generate
git add packages/api-client/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

## Dependencies

- Depends on: TKT-TWD-10
- Blocks: TKT-TWD-12
