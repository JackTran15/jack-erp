# TKT-061 Item ↔ Provider M2M API

## Epic

[EPIC-010 Item Management Enhancement](../epics/EPIC-010-item-management-enhancement.md)

## Summary

API CRUD cho bảng nối `item_providers`, thay thế quan hệ 1-1 `items.provider_id` cũ. 1 item có thể link nhiều NCC, đúng 1 NCC là `is_primary` (mặc định dùng cho gợi ý PO).

## Deliverables

- `ItemProviderEntity`, `ItemProviderService`.
- Endpoint mới dưới `InventoryLocationController` (hoặc controller riêng `ItemProviderController`):
  - `GET    /inventory/items/:id/providers`
  - `POST   /inventory/items/:id/providers` — body `{ providerId: UUID, isPrimary?: boolean }`
  - `DELETE /inventory/items/:id/providers/:providerId`
  - `PATCH  /inventory/items/:id/providers/:providerId/set-primary`
- Validation:
  - Item phải thuộc `actor.organizationId`.
  - Provider phải thuộc cùng org và `isActive = true`.
  - `is_primary = true` cho row mới → tự động set `is_primary = false` cho các row khác của cùng item (atomic, trong transaction).
  - Không cho phép xóa NCC `is_primary` nếu item còn NCC khác — phải set-primary cho NCC khác trước, hoặc xóa NCC primary chỉ được nếu là NCC cuối cùng.

## Acceptance Criteria

- [ ] `POST` với `isPrimary = true` → tự động unset primary cũ trong cùng transaction.
- [ ] `POST` cùng `(item_id, provider_id)` 2 lần → `409 Conflict`.
- [ ] `POST` với provider không cùng org → `400`.
- [ ] `POST` với provider `isActive = false` → `400` (giống logic `validateProvider` cũ).
- [ ] `DELETE` NCC primary trong khi còn NCC khác → `400 "Phải chỉ định NCC chính khác trước khi xóa"`.
- [ ] `PATCH set-primary` atomic, không tạo race condition (2 row primary cùng lúc).
- [ ] Partial unique index DB chặn được edge case 2 primary nếu service logic lỗi.

## Definition of Done

- [ ] PR pass test + lint.
- [ ] Unit test transaction set-primary atomic.
- [ ] Integration test full flow: thêm 3 NCC → set primary luân phiên → xoá NCC phụ → xoá NCC chính cuối cùng.
- [ ] OpenAPI snapshot regenerate.

## Tech Approach

### Entity

```ts
@Entity('item_providers')
@Unique(['itemId', 'providerId'])
export class ItemProviderEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'provider_id', type: 'uuid' }) providerId: string;
  @Column({ name: 'is_primary', default: false }) isPrimary: boolean;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @ManyToOne(() => ProviderEntity)
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;
}
```

### Service logic key

```ts
async link(itemId, providerId, isPrimary, actor) {
  return this.dataSource.transaction(async (manager) => {
    // validate item + provider in org, provider active
    if (isPrimary) {
      await manager.update(ItemProviderEntity,
        { itemId, isPrimary: true }, { isPrimary: false });
    }
    return manager.save(...);
  });
}

async setPrimary(itemId, providerId, actor) {
  return this.dataSource.transaction(async (manager) => {
    await manager.update(ItemProviderEntity,
      { itemId }, { isPrimary: false });
    const updated = await manager.update(ItemProviderEntity,
      { itemId, providerId }, { isPrimary: true });
    if (updated.affected === 0) throw new NotFoundException();
  });
}
```

### Tương thích `ItemEntity`

Trong `ItemEntity`, có thể thêm helper relation:
```ts
@OneToMany(() => ItemProviderEntity, (ip) => ip.item)
providers?: ItemProviderEntity[];
```

Code chỗ nào dùng `item.providerId` (legacy) phải refactor sang query `item.providers.find(p => p.isPrimary)` hoặc join trực tiếp.

### Permission

- Tất cả endpoint dùng `@RequirePermission('inventory.write')` cho mutation, `inventory.read` cho list.
- `@UseGuards(PermissionGuard)` — không cần `BranchScopeGuard` vì item là org-scoped.

## Testing Strategy

- Unit: transaction logic set-primary atomic.
- Integration: full flow như trên.
- DB test: thử insert 2 row `is_primary=true` cùng item → fail bởi partial unique index.

## Dependencies

- Phụ thuộc: TKT-059 (schema), TKT-062 (Provider POST — nếu chưa có thì UX inline-create cần).
- Blocks: TKT-065, TKT-066.
