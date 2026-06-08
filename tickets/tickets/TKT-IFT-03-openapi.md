# TKT-IFT-03 OpenAPI regen + api-client snapshot

## Epic

[EPIC-08062026 Lập phiếu xuất kho từ Lệnh điều chuyển](../epics/EPIC-08062026-goods-issue-from-transfer.md)

## Layer

🟦→Client (generated).

## Summary

Sau khi BE thêm `GET /inventory/transfer-orders/issuable` và mở rộng body `POST /:id/export`, chạy lại OpenAPI generator để `@erp/api-client` có type/endpoint mới cho FE.

## Deliverables

- Chạy API (`make dev-api` hoặc `pnpm --filter @erp/api start:dev`) trên `:4000`, rồi `pnpm openapi:generate`.
- Commit `packages/api-client/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (KHÔNG sửa tay file generated).

## Acceptance Criteria

- [ ] Snapshot có path `GET /inventory/transfer-orders/issuable` (query `from`/`to`) trả mảng `IssuableTransferOrderListItem`.
- [ ] `POST /inventory/transfer-orders/{id}/export` có request body optional (`lines[]`, `reason`, `notes`).
- [ ] `GoodsIssueReferenceType` trong schema có `TRANSFER_ORDER`.

## Definition of Done

- [ ] `pnpm openapi:generate` chạy sạch; diff chỉ chứa endpoint/type của epic này (không drift lạ).
- [ ] `pnpm --filter @erp/api-client build` xanh; FE import được client mới.
- [ ] Generated file không bị sửa tay.

## Tech Approach

Theo CLAUDE.md: API phải đang chạy để generator đọc `/docs-json`. Nếu diff lớn bất thường (do uncommitted ITV chưa regen), regen sau khi ITV-06 đã land để tránh trộn snapshot.

## Dependencies

- Depends on: TKT-IFT-02 (và ITV-06 đã land để snapshot nhất quán).
- Blocks: TKT-IFT-04.
