# TKT-069 Stock-by-location test plan & DoD gate

## Epic

[EPIC-013 Stock-by-Location Query API](../epics/EPIC-013-stock-by-location-api.md)

## Summary

Viết bộ test (unit + e2e) cho endpoint mới, kiểm tra không regression endpoint cũ, và chốt Definition of Done cho EPIC-013.

## Deliverables

- `apps/api/src/modules/inventory/location/inventory-location-stock.service.spec.ts` — unit tests cho service (chạy với in-memory PostgreSQL hoặc testcontainers, theo pattern hiện có ở repo).
- `apps/api/test/e2e/inventory-location-stock.e2e-spec.ts` — e2e cho controller.
- Performance smoke harness (script `scripts/perf/stock-by-location.ts` hoặc test e2e tagged `@performance`).
- README/docs cập nhật ở `docs/07-inventory-management.md` mô tả endpoint mới.

## Acceptance Criteria

### Unit (service spec)

- [ ] Seed fixture: 1 org, 2 branch, 2 storage, 3 location, 6 item (1 inactive, 1 not-pos-visible, 2 cùng category, 2 share provider primary), 12 `stock_balances` row (mix âm/zero/dương), 5 barcode, 2 category, 3 provider, 6 threshold (2 below-min).
- [ ] Test mỗi filter riêng lẻ (8 case) → assert số lượng row + nội dung row đầu tiên.
- [ ] Test mỗi `stockState` (5 case) → assert đúng phân loại quantity.
- [ ] Test combined filters: `search + barcode + isPosVisible` → AND đúng.
- [ ] Test `belowMin` computed đúng cho cả 2 row: 1 có threshold + dưới min, 1 không có threshold (false).
- [ ] Test pagination: `page=2, pageSize=3` → trả 3 row đúng offset.
- [ ] Test sort: `sortBy=quantity, sortOrder=desc` → row đầu có quantity lớn nhất.
- [ ] Test 404: `locationId` không tồn tại.
- [ ] Test 404: `locationId` thuộc org khác.

### E2E

- [ ] Happy path: token valid, location đúng branch → 200 + structure đúng.
- [ ] 401: không gửi `Authorization`.
- [ ] 403: token thiếu permission `inventory.read`.
- [ ] 403: token branch A truy cập location branch B (`X-Branch-Id` cố tình khớp branch A).
- [ ] 404: locationId UUID hợp lệ nhưng không tồn tại.
- [ ] 400: `stockState=foo`.
- [ ] 400: `pageSize=99999`.
- [ ] Combined: `?search=NIKE&stockState=below-min&pageSize=10` → đúng business logic.

### Performance smoke

- [ ] Seed 5,000 `stock_balances` rows trong 1 location → endpoint trả `?pageSize=50` trong **< 500ms** p95 (10 requests).
- [ ] Không có N+1 — verify qua `EXPLAIN ANALYZE` hoặc query log (single SELECT + 1 COUNT).

### No regression

- [ ] `pnpm --filter @erp/api test:e2e -- inventory` (toàn bộ inventory) → xanh.
- [ ] `pnpm --filter @erp/api test:e2e -- pos` → xanh.
- [ ] `pnpm --filter @erp/api test:e2e -- stock-ledger` → xanh.

## Definition of Done

- [ ] Coverage service ≥ 90% lines (đo bằng `pnpm --filter @erp/api test -- --coverage`).
- [ ] CI xanh trên toàn bộ test suite.
- [ ] Doc `docs/07-inventory-management.md` thêm mục "Stock by location query API" với link Swagger.
- [ ] EPIC-013 acceptance criteria checklist tick hết.
- [ ] `packages/api-client/openapi.snapshot.json` không có drift sau khi chạy lại `pnpm openapi:generate`.

## Tech Approach

### Test fixture builder

Tái sử dụng helper seed của `apps/api/test/e2e/helpers/` nếu có (xem các e2e spec hiện tại như `item-management.e2e-spec.ts`).

```ts
async function seedStockByLocationFixture(ds: DataSource) {
  // tạo org → branch → storage → location → category → provider → item → barcode → threshold → stock_balance
  return { org, branchA, branchB, locations: [...], items: [...], expectedRows: { /* per scenario */ } };
}
```

### Performance script

```ts
// scripts/perf/stock-by-location.ts
const N = 5000;
// seed N item + N stock_balance ở 1 location
// đo 10 lần GET endpoint, p95 < 500ms
```

Có thể chạy thủ công, không bắt buộc trong CI mỗi PR.

## Dependencies

- Phụ thuộc: TKT-067, TKT-068.
- Blocks: (đóng EPIC-013).
