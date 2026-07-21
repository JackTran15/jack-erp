# TKT-CVS-03 OpenAPI regen + commit snapshot

## Epic

[EPIC-21072026 Tiền mặt — gộp 1 API tìm kiếm thu/chi + lọc theo cột cho sổ quỹ](../epics/EPIC-21072026-cash-voucher-ledger-search.md)

## Summary

Hai endpoint đọc mới (`POST /v2/cash-vouchers/search`, `POST /v2/cash-ledger/search`) phải xuất hiện
trong snapshot OpenAPI trước khi nối FE.

## Deliverables

- `openapi.snapshot.json` (cập nhật).
- `packages/api-client/src/generated/schema.ts` (sinh tự động — **không** sửa tay).

## Acceptance Criteria

- [ ] Chạy API ở `:4000` rồi `pnpm openapi:generate`.
- [ ] Snapshot chứa cả hai path v2 mới với schema request/response đầy đủ.
- [ ] Không sửa tay file generated.

## Definition of Done

- [ ] `pnpm build:shared` xanh sau khi regen.
- [ ] Diff của snapshot chỉ chứa hai endpoint mới + schema kèm theo (không kéo theo drift lạ).

## Tech Approach

FE gọi hai endpoint v2 này qua `apiClient` (axios), giống các hook deposit — không qua
`erpApi`/openapi-fetch — nhưng snapshot vẫn phải bám sát bề mặt API.

```bash
make dev-api          # terminal riêng
pnpm openapi:generate
```

## Dependencies

- Depends on: TKT-CVS-01, TKT-CVS-02
- Blocks: TKT-CVS-04, TKT-CVS-05
