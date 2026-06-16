# TKT-BAR-01 BE: POS exact-match lookup endpoint (mã vạch HOẶC SKU)

## Epic

[EPIC-16062026 POS barcode-priority search + auto-add](../epics/EPIC-16062026-pos-barcode-auto-add.md)

## Summary

Thêm endpoint READ `GET /pos/branches/:branchId/catalog/lookup?code=<value>` để FE tra **khớp tuyệt đối** một chuỗi đã nhập/quét. Trả về 0..n dòng `PosCatalogLineDto` (cùng shape `getCatalog`) cho item có mã vạch (`item_barcodes.code`) **HOẶC** mã SKU (`items.code`) **bằng đúng** `code`, scope `organizationId` + `branchId`, chỉ `is_active = true AND is_pos_visible = true`. FE auto-add khi mảng có **đúng 1** phần tử. Không entity mới, không migration (`item_barcodes` đã tồn tại).

## Deliverables

- `apps/api/src/modules/pos/dto/pos-catalog-lookup.query.dto.ts` (new) — `PosCatalogLookupQueryDto { code: string }` (`@IsString`, `@IsNotEmpty`, `@MaxLength(100)`, `@ApiProperty`). Export thêm trong `apps/api/src/modules/pos/dto/index.ts`.
- `apps/api/src/modules/pos/services/pos-catalog.service.ts` — thêm method `lookupByCode(branchId, actor, code): Promise<PosCatalogLineDto[]>`. Tái dùng logic gom location/qty của `getCatalog` (cùng `byItem` aggregation, `defaultLocationId = location nhiều tồn nhất`).
- `apps/api/src/modules/pos/pos.controller.ts` — thêm handler `getCatalogLookup(...)`, route `GET branches/:branchId/catalog/lookup`, `@RequirePermission('pos.sale.create')`, `@Actor()`, `@Param('branchId', ParseUUIDPipe)`, `@Query() PosCatalogLookupQueryDto` (class-level `@UseGuards(PermissionGuard, BranchScopeGuard)` + `@RequireBranchScope()` đã có sẵn).
- `apps/api/src/modules/pos/services/pos-catalog.service.spec.ts` — unit/integration test cho `lookupByCode` (mã vạch khớp, SKU khớp, 0 match, >1 match, cross-tenant không lộ).

## Acceptance Criteria

- [ ] Mọi query filter theo `actor.organizationId` + `branchId` truyền vào; không lộ chéo tenant/branch.
- [ ] Match là **exact** (`=`), không ILIKE/partial: `item_barcodes.code = $code` HOẶC `items.code = $code` (so sánh nguyên chuỗi; quyết định nhỏ: barcode/SKU phân biệt hoa-thường theo dữ liệu hiện có — giữ so sánh `=` thẳng, không `LOWER()`).
- [ ] Chỉ trả item `is_active = true AND is_pos_visible = true` (đồng nhất `getCatalog`).
- [ ] Mỗi phần tử trả về là `PosCatalogLineDto` đầy đủ (`itemId`, `productId`, `code`, `name`, `unit`, `sellingPrice`, `quantityOnHand`, `locations[]`, `defaultLocationId`) để FE gọi thẳng `addProductByItem`.
- [ ] Item khớp nhưng **không có `stock_balances`** ở branch → vẫn trả 1 dòng với `quantityOnHand = 0`, `locations = []`, `defaultLocationId = ''` (FE sẽ hiện `OUT_OF_STOCK`, không thêm dòng). Không phải lọc bỏ như `getCatalog`.
- [ ] Endpoint là GET, không side-effect, không phát event, không đụng `IdempotencyInterceptor`.
- [ ] `code` rỗng/space → `ValidationPipe` chặn (400); không tự xử lý empty trong service.

## Definition of Done

- [ ] PR pass `pnpm --filter @erp/api test` và `pnpm --filter @erp/api lint`.
- [ ] Spec phủ: mã vạch khớp → 1 dòng; SKU khớp → 1 dòng; mã trùng nhiều item → n dòng; không khớp → `[]`; item tồn 0 → 1 dòng `quantityOnHand 0 / locations []`; org/branch khác → `[]`.
- [ ] Không thay đổi schema, `synchronize` vẫn false, không migration.
- [ ] Sau khi thêm endpoint: chạy API + `pnpm openapi:generate`; bàn giao việc commit snapshot cho **TKT-BAR-02**.
- [ ] Không tiếng Việt trong source BE (error/comment/Swagger/log đều English).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Query DTO:

```ts
// apps/api/src/modules/pos/dto/pos-catalog-lookup.query.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PosCatalogLookupQueryDto {
  @ApiProperty({ description: 'Exact barcode or SKU code to look up.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code: string;
}
```

Service — exact match, build the SAME `PosCatalogLineDto` shape as `getCatalog`. Drive from `items` (matched by barcode or code) and `LEFT JOIN stock_balances` so a zero-stock item still returns one line:

```ts
// PosCatalogService.lookupByCode
async lookupByCode(
  branchId: string,
  actor: ActorContext,
  code: string,
): Promise<PosCatalogLineDto[]> {
  const orgId = actor.organizationId;
  // params: $1 orgId, $2 branchId, $3 code
  const rows = await this.dataSource.query(
    `SELECT i.id            AS "itemId",
            i.product_id     AS "productId",
            i.code,
            i.name,
            i.unit,
            i.selling_price::text AS "sellingPrice",
            sb.location_id   AS "locationId",
            sb.quantity::text AS "quantity",
            l.name           AS "locationName"
       FROM items i
       LEFT JOIN item_barcodes b
         ON b.item_id = i.id AND b.organization_id = i.organization_id
       LEFT JOIN stock_balances sb
         ON sb.item_id = i.id
        AND sb.organization_id = i.organization_id
        AND sb.branch_id = $2
       LEFT JOIN locations l ON l.id = sb.location_id
      WHERE i.organization_id = $1
        AND i.is_active = true
        AND i.is_pos_visible = true
        AND (i.code = $3 OR b.code = $3)
      ORDER BY i.name ASC, sb.location_id ASC`,
    [orgId, branchId, code],
  );
  // Group rows by itemId → PosCatalogLineDto, mirroring getCatalog:
  //  - sum quantityOnHand, collect locations (skip rows where locationId is null),
  //  - defaultLocationId = location with max qty (or '' when no stock_balances row),
  //  - dedupe items that matched on >1 barcode (LEFT JOIN fan-out).
  // Return the line array (0..n).
}
```

> Lưu ý fan-out: 1 item có nhiều mã vạch → JOIN nhân dòng; gom theo `itemId` (Map) như `getCatalog` đã làm là đủ khử trùng. Không `GROUP BY` trong SQL — gom trên RAM bằng JS (đồng nhất convention repo + `getCatalog`).

Controller:

```ts
@Get('branches/:branchId/catalog/lookup')
@RequirePermission('pos.sale.create')
getCatalogLookup(
  @Param('branchId', ParseUUIDPipe) branchId: string,
  @Query() query: PosCatalogLookupQueryDto,
  @Actor() actor: ActorContext,
) {
  return this.catalogService.lookupByCode(branchId, actor, query.code);
}
```

## Testing Strategy

- `pos-catalog.service.spec.ts`: seed org/branch + items (1 có barcode, 1 trùng SKU code với item khác, 1 tồn 0, 1 thuộc org khác). Assert từng case ở Acceptance Criteria. Chạy `pnpm --filter @erp/api test -- pos-catalog.service.spec.ts`.

## Dependencies

- Depends on: (none new) — `item_barcodes` + `PosCatalogService` đã có.
- Blocks: TKT-BAR-02 (openapi regen), TKT-BAR-03 (FE consume endpoint).
