# TKT-CPD-05 OpenAPI regen + commit snapshot

## Epic

[EPIC-22062026 Hiển thị "Đối tượng" trên Nhập / Xuất / Chuyển kho](../epics/EPIC-22062026-counterparty-display-inventory-docs.md)

## Summary

Sau khi BE đổi: (a) response search 3 flow trả thêm `counterparty { kind, id, code, name }`, (b) transfer DTO v2 nhận thêm `counterpartyKind` + `counterpartyId`. Chạy lại generator + commit snapshot để client typed khớp.

## Deliverables

- `apps/api/openapi.snapshot.json` (updated).
- `packages/api-client/src/generated/schema.ts` (regenerated — **không** hand-edit).

## Acceptance Criteria

- [ ] API chạy trên :4000, `pnpm openapi:generate` chạy xong không lỗi.
- [ ] Snapshot phản ánh transfer DTO v2 (`counterpartyKind`, `counterpartyId`) + response `counterparty`.
- [ ] `pnpm build:shared` xanh (api-client build lại).

## Definition of Done

- [ ] Commit cả `openapi.snapshot.json` + `schema.ts` (generated, not hand-edited).
- [ ] FE `tsc` không vỡ do schema mới.

## Tech Approach

```bash
make dev-api            # API on :4000
pnpm openapi:generate   # regenerate packages/api-client from /docs-json
```

> Lưu ý: FE jack-erp gọi nhiều endpoint qua axios `apiClient` trực tiếp (không hẳn qua generated client) nên CPD-06/07 không **block** chặt vào ticket này; tuy nhiên vẫn phải regen + commit theo convention sau mọi thay đổi endpoint.

## Dependencies

- Depends on: TKT-CPD-02, TKT-CPD-03, TKT-CPD-04.
- Blocks: TKT-CPD-06, TKT-CPD-07.
