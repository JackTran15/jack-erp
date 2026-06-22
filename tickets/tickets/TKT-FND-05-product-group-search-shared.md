# TKT-FND-05 SearchProductGroups (cây) + dialog collapse multi-select

## Epic

[EPIC-18062026 Inventory Foundation](../epics/EPIC-18062026-inventory-foundation.md)

## Layer

🟦 Backend (CQRS query trả cây) + 🟩 Frontend (dialog collapse multi-select dùng chung).

## Summary

Query CQRS + dialog **tìm hàng nâng cao theo nhóm**: **Nhóm hàng → Mẫu mã → Variant**, collapse, **multi-select**, tìm **theo mẫu mã**. API trả **cây lồng nhau**, phân trang theo **mẫu mã (product)**. Dùng chung cho Chuyển/Nhập/Xuất kho.

## Deliverables

- `apps/api/src/modules/inventory/location/dto/search-product-groups.dto.ts`:
  ```ts
  export class SearchProductGroupsDto {
    @IsOptional() @ValidateNested() @Type(()=>StringFilterDto) model?: StringFilterDto; // tìm theo mẫu mã (product code/name)
    @IsOptional() @IsUUID() categoryId?: string;
    @IsOptional() @IsUUID() branchId?: string;   // nếu có → kèm tồn theo chi nhánh
    @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page = 1;
    @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(50) pageSize = 20; // phân trang theo mẫu mã
  }
  ```
- `apps/api/src/modules/inventory/location/queries/search-product-groups.query.ts` + `.handler.ts` — `@QueryHandler`:
  1. Lọc + phân trang **products** (mẫu mã) theo `model`/`categoryId`, scope `organizationId`.
  2. Lấy `items` (variant) của trang products đó + (nếu `branchId`) tồn từ `stock_balance`.
  3. Build cây **trên RAM**: `category → products[] → variants[]`. Item "mồ côi" (`productId == null`) gom vào nhóm "Khác".
  4. Trả:
     ```ts
     { data: [{ category: {id,name}, products: [
         { id, code /*Mã SKU mẫu mã*/, name /*Tên mẫu mã*/, variants: [
            { itemId, sku /*Mã SKU*/, barcode, name /*Tên hàng hoá*/, unit, quantityOnHand }
         ] } ] }],
       total /*số mẫu mã*/, page, pageSize }
     ```
- `apps/api/src/modules/inventory/location/controllers/product-group-search.controller.ts` — `POST /v2/inventory/product-groups/search`, guards + `@RequirePermission('inventory.read')`.
- `packages/shared-interfaces/src/inventory/product-group-tree.ts` — types `ProductGroupNode`, `ProductGroupProduct`, `ProductGroupVariant`.
- `apps/backoffice-web/src/components/shared/product-group-search/`:
  - `ProductGroupSearchDialog.tsx` — props:
    ```ts
    interface Props {
      open: boolean;
      onOpenChange: (o: boolean)=>void;
      branchId?: string;
      multiSelect?: boolean;                 // mặc định true
      onConfirm: (variants: ProductGroupVariant[]) => void;
    }
    ```
    - Render collapse 3 cấp; checkbox ở **variant**; tick **mẫu mã** = chọn hết variant của mẫu (tristate); tìm theo mẫu mã; phân trang theo mẫu mã.
  - `useSearchProductGroups.ts` — hook react-query, key `["product-groups", model, categoryId, branchId, page]`.

## Acceptance Criteria

- [ ] API trả cây category → mẫu mã → variant; phân trang theo **mẫu mã**; `total` = số mẫu mã khớp.
- [ ] Lọc `model` khớp mẫu mã (product code/name); item mồ côi gom nhóm "Khác".
- [ ] Có `branchId` → mỗi variant kèm `quantityOnHand` theo chi nhánh.
- [ ] Dialog: collapse, tick variant lẻ hoặc tick cả mẫu (tristate); `onConfirm` trả danh sách variant đã chọn.
- [ ] Scope `organizationId`; không rò rỉ chéo.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] Handler spec: phân trang theo product, lọc model, orphan group, tồn theo branch.
- [ ] `pnpm openapi:generate` chạy, snapshot + `schema.ts` commit.
- [ ] Source/Swagger tiếng Anh; nhãn FE tiếng Việt.
- [ ] Component import được từ ≥1 page (chứng minh ở EPIC-B/C/D).

## Tech Approach

- Phân trang theo product trước (giữ `total` ổn định), rồi nạp variant/tồn cho trang đó; build cây RAM (xem [[feedback_prefer_in_memory_aggregation]], [[feedback_inline_relations_over_root_map]]).
- **Không** dùng lại `search-inventory-items-v2` (CTE trả phẳng, group product→item) — đây là query mới trả cây 3 cấp; có thể tham chiếu cách join `item_barcodes`.

## Dependencies

- Requires: TKT-FND-01 (category để gom nhóm), `ProductEntity`/`ItemEntity`/`item_barcodes`/`stock_balance`.
- Blocks: TKT-STX-02, TKT-GRV-02, TKT-GIV-02.
