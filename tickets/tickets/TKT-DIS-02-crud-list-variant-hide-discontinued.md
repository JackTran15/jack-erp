# TKT-DIS-02 Generic CRUD list + variant queries — default-hide discontinued

## Epic

[EPIC-10072026 Hide Discontinued Products From Search & Catalog](../epics/EPIC-10072026-hide-discontinued-products.md)

## Summary

`InventoryItemCrudService.listProductGroups` và `listProductItems` hiện coi filter `isActive` là optional (null = show all), nên hàng ngừng kinh doanh vẫn hiển thị trên list/picker. Ticket này đổi mặc định của các query search/picker thành active-only với escape hatch `includeInactive`. **Giữ nguyên** `loadProductVariants` (hydrate bảng variant của form sửa) để còn khôi phục được variant inactive.

## Deliverables

- `apps/api/src/modules/inventory/location/item-crud.service.ts`:
  - `listProductGroups` (~L1228-1338): nếu `includeInactive !== true`, ép param `isActive = true` thay vì null (giữ nhánh SQL `$n::boolean IS NULL OR i.is_active = $n` — chỉ thay giá trị truyền vào).
  - `listProductItems` (~L1481-1521): mặc định `qb.andWhere("i.isActive = true")` trừ khi `includeInactive=true` (hiện chỉ filter khi `query.isActive !== undefined`).
  - `list()` (~L148) và query DTO của nó: thread cờ `includeInactive` từ query xuống `listProductGroups`.
  - **KHÔNG** đổi `loadProductVariants` (~L1385) — form sửa phải thấy cả variant inactive.
- Query DTO tương ứng của list (nếu có `dto/*.dto.ts` cho list endpoint): thêm `includeInactive?: boolean` optional (`@IsOptional`, `@IsBoolean`, `@Type(() => Boolean)` nếu là query param).

## Acceptance Criteria

- [ ] Mọi query scope `actor.organizationId` (+ branch nơi áp dụng); không leak cross-tenant.
- [ ] `listProductGroups` mặc định không trả group toàn variant inactive (`bool_and(is_active)=false`); `includeInactive=true` trả lại.
- [ ] `listProductItems` mặc định không trả variant `isActive=false`; `includeInactive=true` trả lại.
- [ ] `loadProductVariants` (form sửa) **vẫn** trả cả variant inactive — không hồi quy.
- [ ] Filter `isActive` tường minh của caller vẫn ưu tiên khi `includeInactive=true`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Spec phủ: default-hide cho `listProductGroups` & `listProductItems`; `includeInactive=true` show all; `loadProductVariants` vẫn show inactive.
- [ ] Không migration / `synchronize` đổi.
- [ ] Không tiếng Việt trong backend source.

## Tech Approach

`listProductGroups` — chỉ đổi giá trị param `isActive` (nhánh SQL đã có sẵn):

```ts
// Trước: const isActiveParam = query.isActive ?? null;
const isActiveParam =
  query.includeInactive === true ? (query.isActive ?? null) : true;
// param $6 giữ nguyên: `$6::boolean IS NULL OR i.is_active = $6`
```

`listProductItems`:

```ts
if (query.isActive !== undefined) {
  qb.andWhere('i.isActive = :isActive', { isActive: query.isActive });
} else if (query.includeInactive !== true) {
  qb.andWhere('i.isActive = true');
}
```

`loadProductVariants`: không đổi — đây là hydrate cho form sửa, phải thấy cả inactive.

Ghi chú: nếu `includeInactive` không phải field trong DTO của các path này, thêm vào DTO tương ứng; tránh đọc trực tiếp từ raw query object (global `whitelist: true` sẽ strip field không khai báo).

## Testing Strategy

- Unit (`item-crud.service.spec.ts`): seed org + 1 product có 1 variant active + 1 inactive.
  - `listProductGroups` default → group hiện nếu còn variant active; `listProductItems` default → chỉ 1 variant.
  - `includeInactive=true` → cả 2 variant.
  - `loadProductVariants` → luôn 2 variant.

## Dependencies

- Depends on: —
- Blocks: TKT-DIS-03, TKT-DIS-04.
