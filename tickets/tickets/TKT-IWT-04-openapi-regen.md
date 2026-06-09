# TKT-IWT-04 Regenerate OpenAPI client + commit snapshot

## Epic

[EPIC-09062026 Chuyển kho giữa các kho trong cùng chi nhánh](../epics/EPIC-09062026-inter-warehouse-transfer.md)

## Layer

🟦 Backend → 📦 api-client (generated).

## Summary

Sau khi đổi contract endpoint chuyển kho (TKT-IWT-03), regenerate client TS để FE dùng type mới qua `@erp/api-client`.

## Deliverables

- Chạy API (`make dev-api`, :4000) rồi `pnpm openapi:generate`.
- Commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (KHÔNG sửa tay file generated).

## Acceptance Criteria

- [ ] Schema generated chứa field mới: line `sourceStorageId`/`destinationStorageId`/`unitPrice`/`lineValue`, header `transporterUserId`/`attachmentIds`/`transferredAt` và quan hệ inline.
- [ ] `pnpm build:shared` pass; không lỗi type ở consumer api-client.

## Definition of Done

- [ ] Diff snapshot chỉ liên quan endpoint chuyển kho (không kéo theo drift module khác).
- [ ] Commit cả 2 file generated.

## Tech Approach

- Theo đúng quy trình `pnpm openapi:generate` mô tả ở CLAUDE.md; không hand-edit.

## Dependencies

- Requires: TKT-IWT-03.
- Blocks: TKT-IWT-05.
