---
feature: cash-voucher-category-tree
adrs: 4
---

# Logical design — cash-voucher-category-tree

## Approach

Chép mô hình cây của Nhóm hàng hoá sang danh mục thu chi ở cả ba tầng, rồi **tổng quát hoá** phần frontend đang gắn
cứng một entity thay vì chép lần thứ ba:

1. **Schema + entity** — một cột `parent_group_id uuid NULL` tự tham chiếu, FK `ON DELETE SET NULL`, index; entity
   thêm `parentGroupId` + `@ManyToOne parent`. Không migration dữ liệu (A-05).
2. **Luật cha/con trong `CashVoucherCategoriesService`** qua hook của `BaseCrudService`:
   `beforeCreate/beforeUpdate` chuẩn hoá `''`→`null`, cha phải tồn tại trong org (chưa xoá mềm), không tự làm cha,
   không tạo vòng (`assertNoCycle` chép từ `supplier-group-crud.service.ts:106-128`), cha cùng `direction`; khi sửa
   không cho đổi `direction` nếu đang có con. `beforeDelete` từ chối khi còn con (A-04). Config thêm trường
   `parentGroupId` (`relation` → chính entity, `hideInList`) và `enumLabels` Thu/Chi cho `direction`.
3. **Endpoint cây mới theo CQRS** — `POST /v2/cash-voucher-categories/tree`, `SearchCashVoucherCategoryTreeQuery`
   + handler dựng cây trong bộ nhớ như `search-item-category-tree.handler.ts` (tải cả org, `byId`, mồ côi → gốc,
   `search` tỉa cây giữ nhánh khớp), anh em sắp `displayOrder ASC, name ASC`, lọc `direction`/`isActive`. Gác
   `accounting.cash_voucher_category.read`. Sinh lại api-client.
4. **Frontend: `CRUD_TREE_ENTITIES`** — một map `entityKey → { path, queryKey, searchKeys, filterKeys }` trong
   `components/crud/crudTree.ts` và hook `useCrudTree`. `CrudListPage`, `useCrudApi`, `CrudFormDialog` tra map
   này thay cho `entityKey === "inventory-item-categories"`. Nhóm hàng hoá giữ đúng `path`/`queryKey`/body cũ
   (A-09). `flattenCategoryTree`/`collectParentIds` thành generic trên `{ id, children }`.
5. **Form** — `FORM_DEFAULTS` theo entity (`inventory-item-categories.status = "ACTIVE"`,
   `cash-voucher-categories.isActive = true`); picker "Mục cha" nhận prop `filters` mới của `TreeSelectInput`
   để lọc theo `direction` đang chọn (A-10); `TREE_PICKER_CONFIG` thêm khoá
   `cash-voucher-categories.parentGroupId`; `navConfig.ts` thêm mục dưới `catalog-receipts-expenses`.
6. **Dropdown 4 dialog** — `useCashVoucherCategories(direction)` gọi endpoint cây, trả danh sách DFS kèm `depth`;
   option thụt lề bằng NBSP (`<option>` gộp khoảng trắng thường). Giữ `queryKey`, `staleTime`, không lọc
   `isActive` (A-11).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| TypeORM `@Tree("closure-table")` / `materialized-path` | Mô hình mới trong repo; `TreeSelectInput.buildTree`, `flattenCategoryTree`, `hydrateParents` đều đọc `parentGroupId` phẳng — phải viết lại picker và helper thay vì dùng lại |
| Đọc cây bằng CTE đệ quy | Vài trăm dòng mỗi org; handler trong bộ nhớ của Nhóm hàng hoá đã đủ và đã có spec làm khuôn |
| Dựng cây từ `GET /admin/entities/.../records` (danh sách phẳng, `pageSize` 100) | Ghi chú của Akenzy: API mới phải theo CQRS, không tái dùng cái cũ; trần 100 dòng; `TreeSelectInput` đã phải "hydrate" cha thiếu vì lý do này |
| Trang riêng như `ProviderGroupListPage.tsx` | Chép ~300 dòng render cây, dialog, thanh công cụ; hai bản cây lệch nhau theo thời gian |
| Thêm nhánh `entityKey === "cash-voucher-categories"` thứ hai vào `CrudListPage` | Trang đã 1 098 dòng với 11 chỗ gắn cứng; nhánh thứ hai nhân đôi mọi chỗ đó |
| Xoá cha ⇒ con lên gốc (như Nhóm hàng hoá) | Xoá mềm không kích FK `SET NULL`; phải mô phỏng trong `beforeDelete` và âm thầm tái cấu trúc cây (A-04) |
| Cho phép cây trộn Thu/Chi | Dropdown lọc theo `direction` sẽ hiện con không cha hoặc cha không con; báo cáo theo loại lệch (A-02) |
| `<optgroup>` theo mục cha trong dropdown | Chỉ 2 tầng; cây không giới hạn độ sâu (A-08) |
| Seed sẵn nhóm cho 43 mục mặc định | Repo không lưu tên nhóm từ ảnh nguồn; Akenzy chọn giữ phẳng (A-05) |

## Domain model

`CashVoucherCategoryEntity` (bảng `cash_voucher_categories`) thêm:

```
parent_group_id  uuid NULL  FK → cash_voucher_categories(id) ON DELETE SET NULL   -- null = mục gốc
IDX_cash_voucher_categories_parent_group (parent_group_id)
```

Bất biến do service giữ (không có ràng buộc DB tương đương):

- `parent.organizationId = child.organizationId`, `parent.deletedAt IS NULL`.
- `parent.direction = child.direction` cho mọi cạnh ⇒ mỗi cây con thuần một loại.
- Không vòng: duyệt tổ tiên với tập `seen` (dữ liệu có thể đã mang vòng nếu hàng rào từng vắng).
- Mục có con (chưa xoá mềm) không xoá mềm được, không đổi `direction` được.

Không đổi: UNIQUE `(organization_id, code)` tính cả dòng xoá mềm; `display_order` quyết định thứ tự **anh em**
trong cùng cha.

## Contracts

### POST /v2/cash-voucher-categories/tree

`@Controller('cash-voucher-categories') @Post('tree') @Version('2') @UseGuards(PermissionGuard)
@RequirePermission('accounting.cash_voucher_category.read')` — cùng khuôn `POST /v2/cash-vouchers/search`.

```ts
// request — SearchCashVoucherCategoryTreeDto (class-validator, whitelist)
{ search?: string; direction?: 'IN' | 'OUT'; isActive?: boolean }

// response — SearchCashVoucherCategoryTreeResponseDto
{ data: CashVoucherCategoryTreeNodeDto[] }
CashVoucherCategoryTreeNodeDto {
  id: string; code: string; name: string; description: string | null;
  direction: 'IN' | 'OUT'; isActive: boolean; displayOrder: number;
  parentGroupId: string | null; children: CashVoucherCategoryTreeNodeDto[];
}
```

Ngữ nghĩa: chỉ dòng của `actor.organizationId`, chưa xoá mềm; `direction`/`isActive` lọc **trước** khi dựng cây
(cây con thuần loại nên không sinh mồ côi; mồ côi nếu có vẫn thành gốc); `search` khớp không phân biệt hoa thường
trên `name`/`code`, giữ node khớp cùng toàn bộ con cháu và chuỗi tổ tiên, bỏ nhánh không khớp.

### Generic CRUD (không đổi đường dẫn, thêm trường)

`POST/PATCH /admin/entities/cash-voucher-categories/records[/:id]` nhận thêm `parentGroupId?: string | null`.
Config `GET /admin/entities/cash-voucher-categories` trả thêm field
`{ key: 'parentGroupId', label: 'Mục cha', type: 'relation', relationEntity: 'cash-voucher-categories', hideInList: true }`
và `direction.enumLabels = { IN: 'Thu', OUT: 'Chi' }`.

### Frontend

```ts
// components/crud/crudTree.ts
export interface CrudTreeConfig {
  path: '/v2/inventory/item-categories/tree' | '/v2/cash-voucher-categories/tree';
  queryKey: string;          // prefix dùng cho invalidateQueries
  searchKeys: string[];      // column filter nào thành body.search
  filterKeys: string[];      // column filter nào pass-through vào body
}
export const CRUD_TREE_ENTITIES: Record<string, CrudTreeConfig> = {
  'inventory-item-categories': { path: '/v2/inventory/item-categories/tree', queryKey: 'item-category-tree', searchKeys: ['name', 'code'], filterKeys: [] },
  'cash-voucher-categories':   { path: '/v2/cash-voucher-categories/tree',   queryKey: 'cash-voucher-category-tree', searchKeys: ['name', 'code'], filterKeys: ['direction', 'isActive'] },
};
// useCrudTree(entityKey, body, enabled) → useQuery({ queryKey: [cfg.queryKey, body], ... })
// TreeSelectInput: prop mới `filters?: Record<string, unknown>` → query `filters=JSON.stringify(filters)`
```

`useCashVoucherCategories(direction)` trả `CashVoucherCategory[]` (thêm `parentGroupId`, `depth`) theo thứ tự DFS.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Cây mục theo org | bảng `cash_voucher_categories` (`parent_group_id`) | Vĩnh viễn; sửa qua `/admin/cash-voucher-categories` |
| Cây cho bảng quản trị | TanStack Query `["cash-voucher-category-tree", body]` | Invalidate theo prefix sau create/update/delete (`useCrudApi`) |
| Cây cho dropdown phiếu | TanStack Query `treasuryQueryKeys.cashVoucherCategories(direction)` | `staleTime` 5 phút (như hiện tại; không invalidate chéo từ màn quản trị — hành vi cũ) |
| Trạng thái thu gọn | `collapsedIds` trong `CrudListPage` | Theo phiên trang |

## Error taxonomy

| Condition | Where | Behaviour |
| --- | --- | --- |
| Cha không thuộc org / đã xoá mềm | `beforeCreate/Update` | `BadRequestException('Mục cha không tồn tại')` → 400, toast lỗi |
| Tự làm cha | `beforeUpdate` | `BadRequestException('Mục không thể là mục cha của chính nó')` |
| Tạo vòng (mọi tầng) | `assertNoCycle` | `BadRequestException('Không thể chọn mục con làm mục cha')` |
| Cha khác loại | `beforeCreate/Update` | `BadRequestException('Mục cha phải cùng loại Thu/Chi')` |
| Đổi loại khi đang có con | `beforeUpdate` | `BadRequestException('Không thể đổi loại của mục đang có mục con')` |
| Xoá khi đang có con | `beforeDelete` | `BadRequestException('Không thể xóa mục đang có mục con')` |
| Trùng `code` trong org | `BaseCrudService` (23505) | `ConflictException` — như cũ |
| Endpoint cây không có quyền | `PermissionGuard` | 403 |
| Body cây sai kiểu | `ValidationPipe` | 400 |
| Picker chưa có `direction` | `CrudFormDialog` | Không gửi `filters`; hiện cả hai loại; BE là hàng rào (A-10) |

Frontend hiện thông báo qua `getUserFacingApiErrorMessage` như mọi dialog CRUD khác.

## Cache & offline

Không có offline. Sau create/update/delete trên màn quản trị, `useCrudApi` invalidate `["crud", entityKey]`,
`["crud-v2", entityKey]` và `[CRUD_TREE_ENTITIES[entityKey].queryKey]`.

## Observability

Không thêm log/metric. `BaseCrudService.remove` đã log `Deleted … (SOFT)`; các từ chối là 400 thấy được ở
`AuditInterceptor` của `CrudController`.

## ADRs

### ADR-01 — Danh sách kề (`parent_group_id`) + dựng cây trong bộ nhớ qua query CQRS, chép Nhóm hàng hoá

Cột tự tham chiếu, không closure-table / materialized-path, không CTE. Picker và helper hiện có đọc `parentGroupId`
phẳng; số dòng mỗi org là hàng chục đến vài trăm; handler của Nhóm hàng hoá cùng spec là khuôn sẵn.

**Status:** accepted — Akenzy duyệt plan 18/09/2026

### ADR-02 — Tổng quát hoá chế độ cây của `CrudListPage` qua `CRUD_TREE_ENTITIES`, không chép trang, không thêm nhánh gắn cứng

Một map cấu hình + `useCrudTree`; `CrudListPage`, `useCrudApi`, `CrudFormDialog` tra map. Nhóm hàng hoá giữ
nguyên `path`/`queryKey`/body nên các `invalidateQueries` hiện có (kể cả `ItemCategoriesPage` sau nhập Excel) không
đổi. AC-10 là tiêu chí hồi quy.

**Status:** accepted — Akenzy duyệt plan 18/09/2026

### ADR-03 — Từ chối xoá mục đang có con thay vì đẩy con lên gốc

Danh mục xoá mềm nên FK `ON DELETE SET NULL` không bao giờ chạy; mô phỏng nó trong `beforeDelete` sẽ âm thầm tái
cấu trúc cây. Từ chối tường minh, người dùng chuyển/xoá con trước.

**Status:** accepted — Akenzy chọn "Từ chối xóa" 18/09/2026 (D1)

### ADR-04 — Cây con thuần một loại Thu/Chi, BE là hàng rào; picker lọc theo loại chỉ là tiện ích

Bốn dialog lọc dropdown theo `direction`; một cây trộn loại sẽ hiện con không cha. BE từ chối cha khác loại và từ
chối đổi loại khi có con. `TreeSelectInput` nhận `filters` để picker chỉ hiện cùng loại, nhưng không phải điều kiện
đúng đắn.

**Status:** accepted — Akenzy duyệt plan 18/09/2026
