# TKT-064 Item stock thresholds API

## Epic

[EPIC-010 Item Management Enhancement](../epics/EPIC-010-item-management-enhancement.md)

## Summary

API quản lý định mức tồn min/max theo `(item, location)`. UX Option A: form tạo item nhập 1 cặp `min/max` "default" → áp dụng cho **mọi location của org**. Sau đó admin có thể override từng location qua endpoint riêng.

Lazy-create: chỉ insert row khi PATCH hoặc khi tồn thực tế chạm ngưỡng (Phase 2). Không tạo cartesian product trước (tránh phình bảng).

## Deliverables

- `ItemStockThresholdEntity`, `ItemStockThresholdService`.
- Endpoint:
  - `GET   /inventory/items/:id/thresholds` — list tất cả row đã có cho item.
  - `GET   /inventory/items/:id/thresholds/:locationId` — chi tiết (404 nếu chưa có).
  - `PATCH /inventory/items/:id/thresholds/:locationId` — body `{ minQty?, maxQty? }`, upsert.
  - `DELETE /inventory/items/:id/thresholds/:locationId` — clear ngưỡng cho location đó.
- Endpoint set default cho item:
  - `PATCH /inventory/items/:id/thresholds/default` — body `{ minQty?, maxQty? }`. Áp dụng:
    - Tạo / update row cho **mọi `location` trong org**.
    - Hoặc lưu vào 2 cột default trên `ItemEntity` (`default_min_qty`, `default_max_qty`) — xem Tech Approach để chọn.

## Acceptance Criteria

- [ ] `PATCH /inventory/items/:id/thresholds/:locationId` insert nếu chưa có, update nếu đã có (idempotent).
- [ ] `minQty <= maxQty` khi cả hai có giá trị → nếu không thoả: `400`.
- [ ] `null` được phép → nghĩa là "không có ngưỡng".
- [ ] Endpoint default áp dụng cho mọi location active của org (không bao gồm location đã soft-deleted).
- [ ] `GET .../thresholds` trả về cả các location chưa có row, với `minQty: null, maxQty: null` (UX dễ hơn) — hoặc chỉ trả row có thực — tuỳ chọn UX, **chọn 1 và document rõ**.

## Definition of Done

- [ ] PR pass test + lint.
- [ ] Unit test min ≤ max validation.
- [ ] Integration test: PATCH default → query từng location thấy đúng giá trị.
- [ ] OpenAPI snapshot regenerate.

## Tech Approach

### Entity

```ts
@Entity('item_stock_thresholds')
@Unique(['itemId', 'locationId'])
export class ItemStockThresholdEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'location_id', type: 'uuid' }) locationId: string;
  @Column({ name: 'min_qty', type: 'decimal', precision: 18, scale: 2, nullable: true }) minQty?: number;
  @Column({ name: 'max_qty', type: 'decimal', precision: 18, scale: 2, nullable: true }) maxQty?: number;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @ManyToOne(() => LocationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location?: LocationEntity;
}
```

### Lựa chọn lưu "default" của item

**Option 1 — Lưu 2 cột trên `ItemEntity`** (`default_min_qty`, `default_max_qty`):
- Pro: gọn, 1 row representing default.
- Con: query lookup cho location chưa có row phải fallback sang ItemEntity → logic phức tạp.

**Option 2 — Fan-out tới mọi location khi set default** (đã ghi ở Deliverables):
- Pro: query đơn giản — luôn lookup từ `item_stock_thresholds`.
- Con: khi có 100 location × 10000 item → bảng có 1M row. Acceptable.

→ **Khuyến nghị Option 2**.

### `setDefault` logic

```ts
async setDefault(itemId, dto, actor) {
  if (dto.minQty != null && dto.maxQty != null && dto.minQty > dto.maxQty)
    throw new BadRequestException('min phải <= max');

  return this.dataSource.transaction(async (manager) => {
    const locations = await manager.find(LocationEntity, {
      where: { organizationId: actor.organizationId, isActive: true }
    });
    for (const loc of locations) {
      await manager.upsert(ItemStockThresholdEntity, {
        itemId, locationId: loc.id,
        minQty: dto.minQty, maxQty: dto.maxQty,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      }, ['itemId', 'locationId']);
    }
  });
}
```

### Hook khi tạo location mới (out of scope, ghi TBD trong code)

Khi `POST /inventory/locations` → có thể duyệt mọi item của org và copy default từ row hiện có (lấy MIN/MAX phổ biến nhất). Phase 1 **không** làm — chỉ ghi TODO trong service.

### Permission

- `@RequirePermission('inventory.write')` cho mutation; `inventory.read` cho GET.

## Testing Strategy

- Unit: validate min ≤ max.
- Integration: setDefault → mọi location có row, value đúng.
- Performance: setDefault với 1000 location → trong 5s.

## Dependencies

- Phụ thuộc: TKT-059 (schema).
- Blocks: TKT-065 (UI), TKT-066 (E2E).
