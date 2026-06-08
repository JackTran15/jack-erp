# TKT-ITV-06 OpenAPI regen + api-client snapshot

## Epic

[EPIC-07062026 Phiếu Điều Chuyển Kho](../epics/EPIC-07062026-inventory-transfer-voucher.md)

## Layer

🟦 Backend → generated client.

## Summary

Sau khi controller TKT-ITV-04 đổi route (bỏ approve/execute, thêm export/import/by-code/PATCH), regen `@erp/api-client`. Không hand-edit file generated.

## Deliverables

- Chạy API (`make dev-api`, port 4000) → `pnpm openapi:generate`.
- Commit: `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`.

## Acceptance Criteria

- [ ] `schema.ts` phản ánh đúng path `inventory/transfer-orders*`: POST `/`, GET `/`, GET `/by-code/{code}`, GET `/{id}`, PATCH `/{id}`, POST `/{id}/export`, POST `/{id}/import`, POST `/{id}/cancel` (hoặc DELETE `/{id}`); **không còn** `/{id}/approve`, `/{id}/execute`.
- [ ] Body/response chứa field mới (per-line storage, attachmentIds, import_reference, status enum 4 giá trị).
- [ ] `pnpm --filter @erp/api-client build` pass; diff snapshot chỉ thuộc epic này.

## Definition of Done

- [ ] Snapshot + schema committed; không hand-edit generated.
- [ ] `pnpm build` workspace pass.

## Tech Approach

API phải đang chạy mới regen (đọc `/docs-json`). Nếu repo có thay đổi chưa commit gây entangle snapshot → tách commit như các epic search trước.

## Dependencies

- Depends on: TKT-ITV-04.
- Blocks: TKT-ITV-07.
