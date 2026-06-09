# TKT-GRT-03 OpenAPI regen + api-client snapshot

## Epic

[EPIC-08062026 Lập phiếu nhập kho từ chứng từ điều chuyển](../epics/EPIC-08062026-goods-receipt-from-transfer.md)

## Layer

🟩 Tooling — regenerate api-client sau khi thêm `GET /importable` + mở rộng `ImportTransferOrderDto`.

## Summary

Endpoint mới `GET /inventory/transfer-orders/importable` và DTO import mở rộng → regenerate client; commit snapshot.

## Deliverables

- Chạy API (`:4000`), `pnpm openapi:generate`.
- Commit `packages/api-client/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (không sửa tay file generated).

## Acceptance Criteria

- [ ] `schema.ts` có path `/inventory/transfer-orders/importable` + các field import mới.
- [ ] Diff snapshot chỉ gồm thay đổi của epic này (nếu api-client đang lệch nhiều — flag, đừng gộp drift không liên quan).

## Definition of Done

- [ ] `pnpm build` (api-client) xanh; không hand-edit file generated.

## Dependencies

- Depends on: TKT-GRT-02. Blocks: TKT-GRT-04.
