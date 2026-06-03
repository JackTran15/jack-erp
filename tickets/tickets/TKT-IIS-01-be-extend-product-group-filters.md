# TKT-IIS-01 BE: Mở rộng `listProductGroups` với per-field filters

## Epic

[EPIC-03062026 Inventory item server-side grouped search (v2)](../epics/EPIC-03062026-inventory-item-search-v2.md)

## Summary

Mở rộng `InventoryItemCrudService.listProductGroups` (và `ProductGroupsQueryDto`) để nhận thêm **5 filter optional** — `isActive`, `isPosVisible`, `brand`, `itemType`, `productId` — bổ sung cho `search` + `categoryId` đã có. Các filter áp **ở mức item**, vào **cả** nhánh `product` (trong `GROUP BY`), nhánh `orphan`, và **count query**, bằng pattern `($n IS NULL OR …)` nên **khi không truyền filter, hành vi y hệt hiện tại** (an toàn cho `list()` override và `GET /inventory/items/products`). Đây là phần "query logic" mà handler v2 (TKT-IIS-02) sẽ tái dùng — bảo đảm output grouped không lệch byte.

> Theo **Hướng A** của epic. Nếu Step 3 chốt **Hướng B** (aggregate in-memory), ticket này thay bằng "dựng QueryBuilder + FilterBuilder + gom nhóm JS" và logic chuyển hẳn vào handler — xem mục Tech Approach.

## Deliverables

- `apps/api/src/modules/inventory/location/dto/product-group-query.dto.ts` — thêm vào `ProductGroupsQueryDto` các field optional: `isActive?: boolean`, `isPosVisible?: boolean`, `brand?: string`, `itemType?: string`, `productId?: string` (class-validator + `@ApiPropertyOptional`; `@Type(() => Boolean)` cho boolean, `@IsUUID()` cho `productId`).
- `apps/api/src/modules/inventory/location/item-crud.service.ts` — `listProductGroups`: thêm 5 param SQL (`$6..$10`), thêm predicate vào `dataSql` (cả product + orphan), `countSql` (cả 2 nhánh), và nối vào `baseParams`. Giữ nguyên `ORDER BY code ASC`, `GROUP BY p.id, p.code, p.name, ic.id, ic.name`, `LIMIT/OFFSET`.

## Acceptance Criteria

- [ ] Không truyền filter mới → `listProductGroups` trả **y hệt** trước (cùng row/thứ tự/giá trị, cùng `total`); `GET /admin/entities/inventory-items/records` và `GET /inventory/items/products` không đổi hành vi.
- [ ] `isActive`/`isPosVisible` (boolean): chỉ item khớp mới được tính vào nhóm; nhóm còn 0 item → biến mất; `itemCount`/`bool_and`/`AVG` phản ánh đúng tập item còn lại.
- [ ] `brand`/`itemType` (text): ILIKE contains (`%value%`), case-insensitive — nhất quán với UX filter text của trang.
- [ ] `productId` (UUID): exact `i.product_id = $`; áp ở cả nhánh product (orphan có `product_id IS NULL` nên productId loại hết orphan — đúng).
- [ ] `categoryId` + `productId` cùng lúc vẫn đúng `GROUP BY` (group key gồm category).
- [ ] Mọi truy vấn vẫn scope `organization_id = $1`; không rò chéo tenant.
- [ ] Predicate được thêm **đồng bộ** ở `dataSql` (2 nhánh) và `countSql` (2 nhánh) → `data` và `total` luôn nhất quán.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] `item-crud.service.spec.ts` (hoặc spec tương đương) phủ: no-filter parity, từng filter mới (active/posVisible/brand/itemType/productId), kết hợp filter + search + categoryId, và group-rỗng-biến-mất.
- [ ] Không schema change; `synchronize` vẫn false.
- [ ] Không tiếng Việt trong source backend (chỉ comment/Swagger tiếng Anh).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

**Hướng A — extend SQL (đề xuất).** DTO:

```ts
// product-group-query.dto.ts — thêm vào ProductGroupsQueryDto
@ApiPropertyOptional()
@IsOptional() @Type(() => Boolean) @IsBoolean()
isActive?: boolean;

@ApiPropertyOptional()
@IsOptional() @Type(() => Boolean) @IsBoolean()
isPosVisible?: boolean;

@ApiPropertyOptional()
@IsOptional() @IsString()
brand?: string;

@ApiPropertyOptional()
@IsOptional() @IsString()
itemType?: string;

@ApiPropertyOptional()
@IsOptional() @IsUUID()
productId?: string;
```

Service — params + predicate (áp **giống nhau** cho product & orphan, và count):

```ts
const { page = 1, pageSize = 20, search, categoryId,
        isActive, isPosVisible, brand, itemType, productId } = query;
// ...
const activeParam   = isActive ?? null;        // $6  boolean | null
const posParam      = isPosVisible ?? null;    // $7  boolean | null
const brandParam    = brand?.trim() ? `%${brand.trim()}%` : null;     // $8 text
const typeParam     = itemType?.trim() ? `%${itemType.trim()}%` : null; // $9 text
const productIdParam = productId ?? null;       // $10 uuid

// chèn vào WHERE của CẢ product, orphan, count (i = alias item ở mỗi nhánh):
//   AND ($6::boolean IS NULL OR i.is_active      = $6)
//   AND ($7::boolean IS NULL OR i.is_pos_visible = $7)
//   AND ($8::text    IS NULL OR i.brand     ILIKE $8)
//   AND ($9::text    IS NULL OR i.item_type ILIKE $9)
//   AND ($10::uuid   IS NULL OR i.product_id = $10::uuid)

const baseParams = [orgId, searchParam, catParam,
                    activeParam, posParam, brandParam, typeParam, productIdParam];
const [countResult, data] = await Promise.all([
  this.dataSource.query(countSql, baseParams),
  this.dataSource.query(dataSql, [...baseParams, pageSize, offset]), // pageSize=$11, offset=$12
]);
```

Lưu ý: `dataSql` đang dùng `$4`/`$5` cho `LIMIT/OFFSET` — dời thành `$11`/`$12` sau khi chèn `$6..$10`. Trong nhánh `orphan`, `productId` cùng `product_id IS NULL` sẽ loại sạch orphan khi truyền productId (đúng ý nghĩa "lọc theo 1 product").

**Hướng B — in-memory (chỉ khi Step 3 đổi):** bỏ mở rộng SQL; logic chuyển sang handler TKT-IIS-02: `repo.createQueryBuilder('i').leftJoinAndSelect('i.category'...).leftJoinAndSelect('i.product'...)` + `FilterBuilder` (`applyString` brand/itemType, `applyEnum`/where boolean, where categoryId/productId) + Brackets cho `search`, rồi gom nhóm theo `(productId, categoryId)` và tự tính `AVG/bool_and/MIN/COUNT`, sort `code ASC`, paginate JS. Bám sát từng công thức trong `listProductGroups` để parity.

## Testing Strategy

- Unit (`item-crud.service.spec.ts`): seed org có product (nhiều variant, trộn active/posVisible/brand) + orphan; assert no-filter parity (snapshot row/total), từng filter mới, group-rỗng-biến-mất, và `total` khớp `data` qua các trang.

## Dependencies

- Depends on: — (điểm xuất phát của epic).
- Blocks: [TKT-IIS-02](./TKT-IIS-02-be-cqrs-grouped-search-endpoint.md).
