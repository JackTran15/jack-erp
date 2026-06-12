# TKT-STL-03 Regenerate OpenAPI client + commit snapshot

## Epic

[EPIC-09062026 Danh sách Chuyển kho theo mẫu mShopKeeper](../epics/EPIC-09062026-stock-transfer-list-v2.md)

## Layer

🟦 Backend → 📦 api-client (generated).

## Summary

Endpoint v2 search dùng **DTO trong file `*.dto.ts`** nên Swagger CLI plugin introspect được (khác form create dùng inline DTO). FE gọi qua `erpApi`/`useCrudV2Search` (typed từ `@erp/api-client`), nên phải regen client sau TKT-STL-01.

## Deliverables

- Chạy API (`make dev-api`, :4000) → `pnpm openapi:generate`.
- Commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (không sửa tay).

## Acceptance Criteria

- [ ] Schema generated có path `POST /v2/inventory/stock/transfers/search` + request/response shape (filters, `data[].transporter`, `totalAmount`, `lines`).
- [ ] `pnpm build:shared` pass; FE dùng được type mới qua `erpApi.POST`.

## Definition of Done

- [ ] Diff snapshot chỉ liên quan endpoint search Chuyển kho (không kéo drift khác).
- [ ] Commit cả 2 file generated.

## Tech Approach

- Theo quy trình `pnpm openapi:generate` ở CLAUDE.md; không hand-edit `schema.ts`.

## Dependencies

- Requires: TKT-STL-01.
- Blocks: TKT-STL-04.
