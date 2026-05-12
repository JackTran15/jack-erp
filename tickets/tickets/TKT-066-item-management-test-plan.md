# TKT-066 Item management test plan & DoD gate

## Epic

[EPIC-010 Item Management Enhancement](../epics/EPIC-010-item-management-enhancement.md)

## Summary

Test plan & acceptance gate cho EPIC-010. Bao gồm:
- E2E happy path & regression cho luồng item management.
- Migration test với data legacy thực.
- Regression test cho các luồng bị ảnh hưởng: PO nhận hàng, POS checkout, stock transfer, goods issue.
- OpenAPI snapshot diff check.

## Deliverables

- File spec test E2E `apps/api/test/e2e/item-management.e2e-spec.ts`.
- Migration test script `scripts/test-item-mgmt-migration.sh` (chạy trên DB replica).
- Update OpenAPI snapshot `openapi.snapshot.json` và `packages/api-client/src/generated/schema.ts`.
- Update entity docs qua `pnpm docs:entities` (regenerate).
- Update [docs/07-inventory-management.md](../../docs/07-inventory-management.md) phản ánh schema mới.

## Acceptance Criteria

### Migration
- [ ] Chạy migration up trên staging snapshot có ≥ 100 items legacy có cả `category` và `provider_id` → 100% map đúng sang `category_id` + `item_providers`.
- [ ] Drop column `items.category` + `items.provider_id` thành công, query cũ break đã được refactor hết.
- [ ] Rollback (down) chạy được, restore data legacy approximate.

### API
- [ ] `POST /inventory/items` full payload trả 201 với id mới.
- [ ] `GET /inventory/items/:id` trả đầy đủ field mới.
- [ ] `POST /inventory/items/:id/providers` ràng buộc unique, partial unique primary.
- [ ] `POST /inventory/items/:id/barcodes` reject duplicate code cross-item.
- [ ] `PATCH /inventory/items/:id/thresholds/default` cập nhật thresholds cho mọi location.

### POS catalog
- [ ] `GET /pos/branches/:branchId/catalog` không trả về item có `isPosVisible = false`.
- [ ] Item có `isPosVisible = false` nhưng balance > 0 → ẩn khỏi catalog.

### Regression (no break)
- [ ] PO `/inventory/purchase-orders/:id/receive` vẫn ghi ledger đúng.
- [ ] POS checkout `/pos/sales/checkout` vẫn validate stock & ghi ledger SALE_ISSUE.
- [ ] Stock transfer post/approve flow không break.
- [ ] Goods-issue post flow không break.

### UI
- [ ] Tạo item full 3 tab trên backoffice → DB có đúng row mọi bảng.
- [ ] Edit item → load đúng providers/barcodes/thresholds.

### Documentation
- [ ] Cập nhật `docs/07-inventory-management.md`.
- [ ] OpenAPI snapshot mới checked in.
- [ ] CLAUDE.md không cần thay đổi (chưa mention schema cụ thể).

## Definition of Done

- [ ] Tất cả test pass trong CI.
- [ ] Migration đã chạy thành công trên staging.
- [ ] Smoke test trên staging: tạo 1 item, nhập kho 1 PO, bán 1 đơn POS → đầy đủ flow.
- [ ] Sign-off từ PO / team lead.

## Tech Approach

### E2E test outline

```ts
describe('Item Management E2E', () => {
  let token: string;
  let branchId: string, locationId: string, categoryId: string, providerAId: string, providerBId: string;

  beforeAll(async () => {
    // bootstrap test org, login, create branch + storage + location + category + 2 providers
  });

  it('creates item with full payload', async () => {
    const res = await request(app).post('/inventory/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'SP001', name: 'Áo thun', unit: 'cái',
              categoryId, isPosVisible: true,
              purchasePrice: 100000, sellingPrice: 150000,
              weightGram: 200, manufactureYear: 2026 });
    expect(res.status).toBe(201);
    itemId = res.body.id;
  });

  it('links 2 providers, sets primary', async () => {
    await request(app).post(`/inventory/items/${itemId}/providers`)
      .send({ providerId: providerAId, isPrimary: true });
    await request(app).post(`/inventory/items/${itemId}/providers`)
      .send({ providerId: providerBId });

    const list = await request(app).get(`/inventory/items/${itemId}/providers`);
    expect(list.body).toHaveLength(2);
    expect(list.body.find(p => p.isPrimary).providerId).toBe(providerAId);
  });

  it('adds 2 barcodes', async () => {
    await request(app).post(`/inventory/items/${itemId}/barcodes`).send({ code: 'EAN001' });
    await request(app).post(`/inventory/items/${itemId}/barcodes`).send({ code: 'INT001' });
    // duplicate
    const dup = await request(app).post(`/inventory/items/${itemId}/barcodes`).send({ code: 'EAN001' });
    expect(dup.status).toBe(409);
  });

  it('sets default thresholds', async () => {
    await request(app).patch(`/inventory/items/${itemId}/thresholds/default`)
      .send({ minQty: 10, maxQty: 100 });
    const t = await request(app).get(`/inventory/items/${itemId}/thresholds/${locationId}`);
    expect(t.body).toMatchObject({ minQty: '10.00', maxQty: '100.00' });
  });

  it('hides item from POS catalog when isPosVisible = false', async () => {
    await request(app).patch(`/inventory/items/${itemId}`).send({ isPosVisible: false });
    const cat = await request(app).get(`/pos/branches/${branchId}/catalog`);
    expect(cat.body.find(i => i.itemId === itemId)).toBeUndefined();
  });
});
```

### Migration test on staging replica

```bash
# 1. clone prod data to staging
# 2. snapshot DB before
pg_dump -s -t items -t inventory_providers > before.sql
# 3. run migration
pnpm migration:run
# 4. assert counts
psql -c "SELECT COUNT(*) FROM items WHERE category IS NOT NULL"  # should be 0 (column dropped)
psql -c "SELECT COUNT(*) FROM item_providers WHERE is_primary"   # should equal original items.provider_id NOT NULL count
# 5. test rollback
pnpm migration:revert
```

## Dependencies

- Phụ thuộc: TKT-059, TKT-060, TKT-061, TKT-062, TKT-063, TKT-064, TKT-065 (tất cả).
- Blocks: epic close.
