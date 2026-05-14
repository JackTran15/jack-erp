# TKT-060 Item entity & DTO enhancement

## Epic

[EPIC-010 Item Management Enhancement](../epics/EPIC-010-item-management-enhancement.md)

## Summary

Cập nhật `ItemEntity` TypeORM và các DTO/Service/CrudConfig để reflect schema mới sau TKT-059. Bao gồm filter POS catalog theo `is_pos_visible`.

## Deliverables

- `ItemEntity` thêm các cột mới (`categoryId`, `isPosVisible`, physical specs).
- `CreateItemDto` / `UpdateItemDto` cập nhật (loại bỏ `category` string, `providerId` đơn).
- `ItemCrudService` và `InventoryLocationService.createItem` / `updateItem` validate `categoryId` (kiểm tra tồn tại trong org).
- `INVENTORY_ITEM_ENTITY_CONFIG` (CrudEntityConfig) cập nhật `fields[]` để form auto-render nhóm field mới.
- `pos-catalog.service.ts` thêm `WHERE items.is_pos_visible = TRUE` vào query.

## Acceptance Criteria

- [ ] `POST /inventory/items` chấp nhận: `name`, `code`, `unit`, `description`, `purchasePrice`, `sellingPrice`, `categoryId`, `isPosVisible`, `weightGram`, `lengthCm`, `widthCm`, `heightCm`, `manufactureYear`, `composition`, `productId`, `isActive`.
- [ ] DTO reject `category` (string), `providerId` (đơn) — vì đã chuyển sang flow khác.
- [ ] `categoryId` không tồn tại / không cùng org → `400 BadRequest`.
- [ ] `isPosVisible` default `true` khi không truyền.
- [ ] POS catalog không trả về item có `isPosVisible = false`, kể cả khi balance > 0.
- [ ] Generic CRUD list `/admin/entities/inventory-items` hiển thị đúng các field mới (label tiếng Việt).

## Definition of Done

- [ ] PR pass `pnpm test` + `pnpm lint`.
- [ ] Unit test cho validation `categoryId` cross-org.
- [ ] Unit test POS catalog skip item ẩn.
- [ ] OpenAPI regenerate, `packages/api-client` cập nhật.

## Tech Approach

### `ItemEntity` (sửa)

```ts
@Entity('items')
@Unique(['organizationId', 'code'])
export class ItemEntity extends BaseEntity {
  @Column() code: string;
  @Column() name: string;
  @Column({ nullable: true }) description?: string;
  @Column() unit: string;

  // ─── Sửa: category string → categoryId FK ────────────
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId?: string;
  @ManyToOne(() => ItemCategoryEntity, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: ItemCategoryEntity;

  // ─── Bỏ: providerId, category string ─────────────────

  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'is_pos_visible', default: true }) isPosVisible: boolean;
  @Column({ name: 'purchase_price', type: 'decimal', precision: 18, scale: 2, default: 0 }) purchasePrice: number;
  @Column({ name: 'selling_price', type: 'decimal', precision: 18, scale: 2, default: 0 }) sellingPrice: number;

  // ─── Thêm: physical specs ────────────────────────────
  @Column({ name: 'weight_gram', type: 'decimal', precision: 18, scale: 2, nullable: true }) weightGram?: number;
  @Column({ name: 'length_cm', type: 'decimal', precision: 18, scale: 2, nullable: true }) lengthCm?: number;
  @Column({ name: 'width_cm', type: 'decimal', precision: 18, scale: 2, nullable: true }) widthCm?: number;
  @Column({ name: 'height_cm', type: 'decimal', precision: 18, scale: 2, nullable: true }) heightCm?: number;
  @Column({ name: 'manufacture_year', type: 'smallint', nullable: true }) manufactureYear?: number;
  @Column({ type: 'text', nullable: true }) composition?: string;

  @Column({ name: 'product_id', type: 'uuid', nullable: true }) productId?: string;
  @Column({ name: 'variant_label', nullable: true }) variantLabel?: string;
}
```

### DTO

`CreateItemDto`:
```ts
{
  code, name, unit, description?,
  categoryId?: UUID,
  isActive?: boolean, isPosVisible?: boolean,
  purchasePrice?: number, sellingPrice?: number,
  weightGram?, lengthCm?, widthCm?, heightCm?, manufactureYear?, composition?,
  productId?: UUID
}
```

`UpdateItemDto`: PartialType của trên.

### Validation thêm vào `createItem` / `updateItem`

```ts
if (dto.categoryId) {
  const cat = await this.categoryRepo.findOne({
    where: { id: dto.categoryId, organizationId: actor.organizationId }
  });
  if (!cat) throw new BadRequestException(`Category ${dto.categoryId} không tồn tại trong tổ chức`);
}
```

### `pos-catalog.service.ts`

Trong query SQL/QueryBuilder hiện tại, thêm:
```sql
AND items.is_pos_visible = TRUE
```

### CrudEntityConfig

Cập nhật `INVENTORY_ITEM_ENTITY_CONFIG.fields[]` thêm:
- `categoryId` (type: `relation`, target: `inventory-item-categories`)
- `isPosVisible`, `weightGram`, ..., `composition`
- Bỏ `category` string khỏi `fields` và `searchableFields`.

## Testing Strategy

- Unit test: validate categoryId cross-org reject.
- Unit test: POS catalog filter loại item ẩn.
- Integration test: tạo + update item full payload qua `POST /inventory/items`.

## Dependencies

- Phụ thuộc: TKT-059 (schema).
- Blocks: TKT-065 (UI), TKT-066 (E2E).
