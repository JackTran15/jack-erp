# TKT-IIF-02 Item category extension (parent + description + commission)

## Epic

[EPIC-31052026 Inventory Item Form Refactor](../epics/EPIC-31052026-inventory-item-form-refactor.md)

## Summary

Dialog "Thêm mới nhóm hàng hóa" (ảnh #4/#5) có 2 tab: **Thông tin chung** (Mã, Tên, **Thuộc nhóm**, **Mô tả**) và **Hoa hồng** (bảng: Vị trí công việc, Cách tính hoa hồng, Mức tính, Giới hạn giảm giá %). Hiện `ItemCategoryEntity` chỉ có `code` + `name`. Ticket này mở rộng entity (thêm `parentGroupId` self-FK + `description`), thêm bảng con commission, và nâng `inventory-item-categories` lên service custom (override create/update) để lưu nested — vẫn giữ entityKey cũ.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-ExtendItemCategory.ts` (new) — hand-written:
  - `ALTER TABLE inventory_item_categories ADD COLUMN parent_group_id uuid NULL` + FK self-ref + `ADD COLUMN description text NULL`.
  - `CREATE TABLE inventory_item_category_commissions` (id, organization_id, category_id FK, position_id uuid NULL, position_name varchar NULL, method varchar, rate numeric(18,4), discount_limit_percent numeric(9,4), timestamps, created_by).
- `apps/api/src/modules/inventory/location/item-category.entity.ts` — thêm `parentGroupId?: string`, `description?: string`, relation `commissions: ItemCategoryCommissionEntity[]` (optional eager off).
- `apps/api/src/modules/inventory/location/item-category-commission.entity.ts` (new) — entity bảng con + enum `CommissionMethod { PERCENT = 'PERCENT', AMOUNT = 'AMOUNT' }`.
- `apps/api/src/modules/inventory/location/dto/{create,update}-item-category.dto.ts` (new) — `code?`, `name`, `parentGroupId?`, `description?`, `commissions?: ItemCategoryCommissionInput[]` (nested, `@ValidateNested`, `@Type`).
- `apps/api/src/modules/inventory/location/item-category-crud.service.ts` — chuyển sang **override `create`/`update`** (theo pattern `InventoryItemCrudService`): persist parent/description + reconcile `commissions[]` trong transaction. Cập nhật `CrudEntityConfig.fields` (thêm `code`, `parentGroupId`, `description`). Đăng ký `TypeOrmModule.forFeature([ItemCategoryCommissionEntity])`.

## Acceptance Criteria

- [ ] `POST/PATCH /admin/entities/inventory-item-categories/records` nhận `code`, `name`, `parentGroupId`, `description`, `commissions[]`; lưu đủ trong 1 transaction.
- [ ] `parentGroupId` phải là category cùng org; không cho trỏ vòng (category trỏ chính nó) — reject 400.
- [ ] Update reconcile commission: delete dòng cũ + insert dòng mới theo payload (deterministic), không nhân bản.
- [ ] Mọi query filter theo `actor.organizationId`.
- [ ] Migration giữ category cũ hợp lệ: `parent_group_id` NULL, `description` NULL, không có dòng commission.

## Definition of Done

- [ ] PR pass `pnpm --filter @erp/api test` + lint.
- [ ] Spec: tạo category có parent + 2 dòng commission; update đổi commission; cross-org isolation; self-parent rejection.
- [ ] `synchronize` false; chỉ migration đụng schema.
- [ ] `pnpm openapi:generate` + commit snapshot nếu diff.
- [ ] No Vietnamese trong backend source.

## Tech Approach

```ts
export enum CommissionMethod { PERCENT = 'PERCENT', AMOUNT = 'AMOUNT' }

@Entity('inventory_item_category_commissions')
export class ItemCategoryCommissionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') organizationId: string;
  @Column('uuid') categoryId: string;
  @Column({ type: 'uuid', nullable: true }) positionId?: string;   // optional ref HR position
  @Column({ nullable: true }) positionName?: string;               // denormalized "Vị trí công việc"
  @Column({ type: 'varchar', default: CommissionMethod.PERCENT }) method: CommissionMethod;
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 }) rate: string;
  @Column({ name: 'discount_limit_percent', type: 'numeric', precision: 9, scale: 4, default: 0 }) discountLimitPercent: string;
}
```

- "Vị trí công việc": kiểm tra module `hr` xem có entity position list không (`apps/api/src/modules/hr`). Nếu có → `positionId` ref + denormalize `positionName`; nếu chưa → chỉ dùng `positionName` free-text. Quyết định ở bước implement, không bịa endpoint.
- Override create/update mirror `InventoryItemCrudService` (split nested → save parent → reconcile children in `dataSource.transaction`).

## Testing Strategy

- Unit (`item-category-crud.service.spec.ts`): create với parent+commission; update reconcile; org-scope; reject self-parent.

## Dependencies

- Depends on: generic CRUD platform (đã có).
- Blocks: TKT-IIF-04 (FE category hooks), TKT-IIF-05 (category dialog).
