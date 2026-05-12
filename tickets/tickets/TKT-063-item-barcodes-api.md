# TKT-063 Item barcodes CRUD API

## Epic

[EPIC-010 Item Management Enhancement](../epics/EPIC-010-item-management-enhancement.md)

## Summary

API CRUD cho `item_barcodes`. Mỗi item có thể có nhiều mã vạch (EAN nhà sản xuất + mã nội bộ); unique theo cặp `(organizationId, code)`. Phase 1 chưa gắn `unitConversionId` (sẽ thêm cột khi Phase 2 build unit conversion).

## Deliverables

- `ItemBarcodeEntity`, `ItemBarcodeService`.
- Endpoint:
  - `GET    /inventory/items/:id/barcodes`
  - `POST   /inventory/items/:id/barcodes` — body `{ code, notes? }`
  - `DELETE /inventory/items/:id/barcodes/:barcodeId`
- Endpoint lookup ngược dùng cho scanner POS (đề xuất, optional):
  - `GET    /inventory/barcodes/lookup?code=<barcode>` → trả `{ itemId, item }`.

## Acceptance Criteria

- [ ] `POST` reject `code` trùng trong cùng org → `409`.
- [ ] `POST` validate item thuộc cùng org → `403/404` nếu không.
- [ ] `code` trim whitespace trước khi lưu.
- [ ] Code length 1–100 ký tự, ký tự cho phép: alphanumeric + `-_.`.
- [ ] `DELETE` hard delete (barcode không có FK reference từ chỗ khác trừ item).
- [ ] `GET /inventory/barcodes/lookup` trả `404` khi không tìm thấy.

## Definition of Done

- [ ] PR pass test + lint.
- [ ] Unit test reject duplicate code cross-item trong cùng org.
- [ ] Integration test full flow.
- [ ] OpenAPI snapshot regenerate.

## Tech Approach

### Entity

```ts
@Entity('item_barcodes')
@Unique(['organizationId', 'code'])
export class ItemBarcodeEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ length: 100 }) code: string;
  @Column({ type: 'text', nullable: true }) notes?: string;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;
}
```

### Service

```ts
async create(itemId, dto, actor) {
  const item = await this.itemService.getItemById(itemId, actor);  // validate org
  const code = dto.code.trim();
  if (!/^[A-Za-z0-9\-_.]{1,100}$/.test(code))
    throw new BadRequestException('Mã vạch không hợp lệ');
  const exists = await this.repo.findOne({
    where: { organizationId: actor.organizationId, code }
  });
  if (exists) throw new ConflictException(`Mã vạch "${code}" đã tồn tại`);
  return this.repo.save({
    itemId, code, notes: dto.notes,
    organizationId: actor.organizationId,
    createdBy: actor.userId,
  });
}

async lookup(code, actor) {
  const bc = await this.repo.findOne({
    where: { organizationId: actor.organizationId, code: code.trim() },
    relations: ['item'],
  });
  if (!bc) throw new NotFoundException();
  return { itemId: bc.itemId, item: bc.item };
}
```

### Permission

- `@RequirePermission('inventory.write')` cho mutation.
- `@RequirePermission('inventory.read')` cho GET (kể cả lookup, vì POS dùng).

## Testing Strategy

- Unit: regex validation, trim, duplicate detection.
- Integration: thêm 3 barcode → list → delete 1 → lookup.

## Dependencies

- Phụ thuộc: TKT-059 (schema).
- Blocks: TKT-065 (UI), TKT-066 (E2E).
