# TKT-FND-01 Nhóm hàng hoá phân cấp + query cây cha→con

## Epic

[EPIC-18062026 Inventory Foundation](../epics/EPIC-18062026-inventory-foundation.md)

## Layer

🟦 Backend (map cột + CQRS query) + 🟩 Frontend (parent picker + render cây).

## Summary

Phơi bày quan hệ cha–con của nhóm hàng. Cột `parent_group_id` **đã tồn tại trong DB** (migration `1782400000000-ExtendItemCategory.ts`: cột + FK `FK_item_category_parent` ON DELETE SET NULL + index `idx_item_category_parent`) nhưng **entity chưa map**. Ticket: (1) map cột vào `ItemCategoryEntity`, expose ở CRUD config để form chọn `parent`; (2) viết query CQRS mới trả **cây 2 cấp** (cha trước, con nằm trong `children[]`) cho picker + trang list.

## Deliverables

- `apps/api/src/modules/inventory/location/item-category.entity.ts` — thêm:
  ```ts
  @Column({ name: 'parent_group_id', type: 'uuid', nullable: true, comment: 'Self-FK to parent category; null = root group' })
  parentGroupId?: string;

  @ManyToOne(() => ItemCategoryEntity, { nullable: true })
  @JoinColumn({ name: 'parent_group_id' })
  parent?: ItemCategoryEntity;
  ```
- `apps/api/src/modules/inventory/location/item-category-crud.service.ts` — thêm field `parentGroupId` (type `reference`, label `Nhóm cha`, nguồn options = chính entity, `hideInList: false`) vào `INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG`. Service đã có `ensureParentValid()` (chặn tự trỏ chính nó) — **giữ**, bổ sung chặn **chu trình 1 cấp** (con không được làm cha của cha trực tiếp) là đủ vì cây 2 cấp.
- `apps/api/src/modules/inventory/location/dto/search-item-category-tree.dto.ts` — `{ search?: StringFilterDto; status?: ItemCategoryStatus; includeEmpty?: boolean }`.
- `apps/api/src/modules/inventory/location/queries/search-item-category-tree.query.ts` — `SearchItemCategoryTreeQuery { dto, actor }`.
- `apps/api/src/modules/inventory/location/queries/search-item-category-tree.handler.ts` — `@QueryHandler`: fetch toàn bộ nhóm theo `organizationId`, build cây **trên RAM** (cha = `parentGroupId == null`, con gắn vào `parent.children[]`); nhóm "mồ côi" (parent đã xoá → SET NULL) coi như cha. Trả `[{ ...category, children: ItemCategory[] }]`, cha sort theo `name`, con sort theo `name`.
- `apps/api/src/modules/inventory/location/controllers/item-category-v2.controller.ts` — `POST /v2/inventory/item-categories/tree`, `@UseGuards(AuthGuard, PermissionGuard)`, `@RequirePermission('inventory.read')`, dispatch `QueryBus`.
- `inventory-location.module.ts` — import `CqrsModule` (nếu chưa), register handler + controller.
- `packages/shared-interfaces/src/inventory/item-category-tree.ts` — type `ItemCategoryTreeNode` cho FE.
- `apps/backoffice-web/src/components/crud/CrudFormDialog.tsx` (nhánh category) — thêm `<Select>` chọn `Nhóm cha` (options từ `POST /v2/inventory/item-categories/tree`, loại trừ chính bản ghi đang sửa & các con của nó).
- `apps/backoffice-web/src/components/crud/CrudListPage.tsx` (nhánh `inventory-item-categories`) — render **ưu tiên cha trước, con thụt vào** dựa trên cây trả về.

## Acceptance Criteria

- [ ] `POST /v2/inventory/item-categories/tree` trả cây 2 cấp; cha trước, con trong `children[]`; scope `organizationId`.
- [ ] Form tạo/sửa nhóm có picker `Nhóm cha`; chọn cha lưu `parentGroupId`; không cho chọn chính nó hoặc con của nó.
- [ ] Trang list nhóm hàng hiển thị cha → con (con thụt vào / nhóm dưới cha).
- [ ] Nhóm có `parentGroupId` trỏ tới bản ghi đã xoá vẫn hiển thị như cha (không vỡ).

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` pass; Swagger hiện DTO tree.
- [ ] Handler spec: seed cha+con, mồ côi, self-parent rejected.
- [ ] `pnpm openapi:generate` chạy, snapshot + `schema.ts` commit.
- [ ] Source/Swagger tiếng Anh; nhãn FE tiếng Việt.

## Tech Approach

- Build cây trên RAM (xem [[feedback_prefer_in_memory_aggregation]]); inline `children` vào từng cha, **không** trả root map `{[id]: ...}` (xem [[feedback_inline_relations_over_root_map]]).
- Giữ ghi (create/update `parentGroupId`) qua CRUD generic hiện có — chỉ READ là CQRS mới. Không sửa write-path generic.

## Dependencies

- Requires: cột `parent_group_id` đã có (migration cũ).
- Blocks: TKT-FND-05 (dialog nhóm hàng dùng category để gom nhóm).
