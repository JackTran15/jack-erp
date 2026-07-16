# TKT-DIS-04 Tests + Definition-of-Done gate

## Epic

[EPIC-10072026 Hide Discontinued Products From Search & Catalog](../epics/EPIC-10072026-hide-discontinued-products.md)

## Summary

Chốt epic bằng bộ test phủ toàn bộ luật ẩn/hiện hàng ngừng kinh doanh và xác nhận các đường không được đổi (POS catalog, export) không hồi quy.

## Deliverables

- Bổ sung/hoàn thiện spec cho TKT-DIS-01 (handler v2) và TKT-DIS-02 (`item-crud.service`).
- E2E (nếu khả thi, `erp_test`): seed org + branch + 1 product [1 variant active + 1 inactive] + 1 orphan inactive.
  - `POST /v2/inventory-items/search` không cờ → không có hàng inactive.
  - `includeInactive=true` → có hàng inactive.
  - `GET pos/branches/:id/catalog/products` → không có hàng inactive (không đổi).
  - `GET /inventory/csv/export` (hoặc excel buffer) → **có** hàng inactive, cột `Inactive="Có"`.

## Acceptance Criteria

- [ ] Tất cả AC của TKT-DIS-01/02/03 xanh.
- [ ] Regression: POS catalog vẫn ẩn inactive; export vẫn hiện inactive.
- [ ] Không leak cross-tenant trong mọi query mới.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] `pnpm --filter @erp/api test:e2e` xanh (đọc output thật, không tin exit message do Kafka teardown).
- [ ] openapi snapshot đã commit (TKT-DIS-03).
- [ ] Không tiếng Việt trong backend source; không TODO/FIXME ngoài plan.

## Testing Strategy

- Unit: default-hide, includeInactive override, isActive tường minh, edit-form hydration giữ inactive.
- E2E: ma trận search/catalog/export như trên, chạy serial (`maxWorkers: 1`).

## Dependencies

- Depends on: TKT-DIS-01, TKT-DIS-02, TKT-DIS-03.
- Blocks: —
