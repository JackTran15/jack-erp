# TKT-BAR-02 OpenAPI regen + api-client snapshot

## Epic

[EPIC-16062026 POS barcode-priority search + auto-add](../epics/EPIC-16062026-pos-barcode-auto-add.md)

## Summary

Sau khi TKT-BAR-01 thêm `GET /pos/branches/:branchId/catalog/lookup`, chạy lại generator OpenAPI và commit snapshot + client sinh ra để giữ contract đồng bộ. (pos-web gọi API qua `http` + `catalogService` riêng, **không** import `@erp/api-client`, nên đây là bước giữ contract/snapshot — không phải dependency build của FE.)

## Deliverables

- `apps/api/openapi.snapshot.json` — cập nhật (thêm path `/pos/branches/{branchId}/catalog/lookup`).
- `packages/api-client/src/generated/schema.ts` — regenerate (KHÔNG sửa tay).

## Acceptance Criteria

- [ ] API chạy local (`:4000`), `pnpm openapi:generate` chạy thành công.
- [ ] Diff snapshot **chỉ** chứa endpoint mới (không drift ngoài phạm vi); nếu có drift lạ → dừng, báo lại, không commit bừa.
- [ ] `packages/api-client` build pass sau regen.

## Definition of Done

- [ ] `openapi.snapshot.json` + `schema.ts` đã commit, không hand-edit file generated.
- [ ] Không thay đổi nào khác lọt vào commit.

## Tech Approach

```bash
# API phải đang chạy trên :4000
make dev-api
pnpm openapi:generate
git add apps/api/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

## Dependencies

- Depends on: TKT-BAR-01.
- Blocks: (none — TKT-BAR-03 chỉ cần endpoint chạy, không cần generated client).
