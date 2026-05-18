# TKT-067 Stock-by-location DTO & Service

## Epic

[EPIC-013 Stock-by-Location Query API](../epics/EPIC-013-stock-by-location-api.md)

## Summary

Tạo `StockByLocationQueryDto`, enum `StockStateFilter` (shared-interfaces), và service `InventoryLocationStockService.getStockByLocation(locationId, query, actor)` thực thi truy vấn join `stock_balances ↔ items ↔ item_categories ↔ item_stock_thresholds ↔ item_barcodes ↔ item_providers ↔ providers`, áp dụng filter + tính `belowMin`. Service phải verify location thuộc `actor.organizationId` (404) và branch scope (delegate `BranchScopeGuard` ở controller).

## Deliverables

- `packages/shared-interfaces/src/inventory/stock-by-location.ts` (mới):
  - `enum StockStateFilter { ALL = 'all', POSITIVE = 'positive', ZERO = 'zero', NEGATIVE = 'negative', BELOW_MIN = 'below-min' }`
  - `interface StockByLocationItem { ... }` (response item shape)
  - `interface StockByLocationMeta { location: {...}; total: number; page: number; pageSize: number }`
- `apps/api/src/modules/inventory/location/dto/stock-by-location.query.dto.ts` (mới):
  - Extends `PaginationQueryDto`
  - Optional fields: `search`, `barcode`, `categoryId`, `providerId`, `isPosVisible`, `isActive`, `stockState` (default `ALL`)
  - class-validator + `@ApiPropertyOptional`
- `apps/api/src/modules/inventory/location/inventory-location-stock.service.ts` (mới):
  - `getStockByLocation(locationId, query, actor): Promise<{ data, meta }>`
  - Helper `resolveLocation(locationId, orgId)` → throw `NotFoundException` nếu không tồn tại hoặc khác org.
  - Helper `buildQuery(...)` áp dụng filter mapping.
  - Helper `mapRow(row)` → DTO + compute `belowMin = minQty != null && quantity < minQty`.
- Đăng ký service vào `InventoryLocationModule.providers` (chưa export controller — sẽ làm ở TKT-068).

## Acceptance Criteria

- [ ] `resolveLocation` throw `NotFoundException` khi `locationId` không tồn tại hoặc không thuộc `actor.organizationId`.
- [ ] `getStockByLocation` trả về `meta.location` đầy đủ (join `locations → storages → branches`).
- [ ] Filter `search` áp dụng `i.code ILIKE :s OR i.name ILIKE :s` (escape `%`, `_`, `\`).
- [ ] Filter `barcode` áp dụng `EXISTS (SELECT 1 FROM item_barcodes ib WHERE ib.item_id = i.id AND ib.code = :barcode AND ib.organization_id = :org)` — exact match.
- [ ] Filter `categoryId` áp dụng `i.category_id = :cat`.
- [ ] Filter `providerId` áp dụng `EXISTS (SELECT 1 FROM item_providers ip WHERE ip.item_id = i.id AND ip.provider_id = :prov)`.
- [ ] Filter `isPosVisible` / `isActive` áp dụng `i.is_pos_visible = :flag` / `i.is_active = :flag`.
- [ ] Filter `stockState`:
  - `all` → không filter (default, bao gồm cả `quantity < 0`).
  - `positive` → `sb.quantity > 0`.
  - `zero` → `sb.quantity = 0`.
  - `negative` → `sb.quantity < 0`.
  - `below-min` → `th.min_qty IS NOT NULL AND sb.quantity < th.min_qty`.
- [ ] Mỗi row trả về `barcodes: string[]` (mảng tất cả code từ `item_barcodes`) và `providers: [{providerId, providerName, isPrimary}]` — aggregate trong 1 query (array_agg / json_agg), không N+1.
- [ ] `belowMin` được compute đúng cho mọi row (true khi `minQty != null && quantity < minQty`).
- [ ] Pagination: `page`, `pageSize` (default 50, max 200), `sortBy` (whitelist: `code`, `name`, `quantity`, `lastMovementAt`), `sortOrder` (`asc|desc`).

## Definition of Done

- [ ] PR pass `pnpm --filter @erp/api test`, `pnpm --filter @erp/api lint`.
- [ ] Service spec cover: 8 filter cases + 5 stockState cases + pagination + 404 case.
- [ ] Không TODO/FIXME ngoài kế hoạch.
- [ ] Không sửa schema (TypeORM migration).

## Tech Approach

### Query DTO

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { StockStateFilter } from '@erp/shared-interfaces';
import { PaginationQueryDto } from '../../../crud/dto';

export class StockByLocationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm partial trong code & name' })
  @IsOptional() @IsString() @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ description: 'Exact match item_barcodes.code' })
  @IsOptional() @IsString() @Length(1, 100)
  barcode?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  providerId?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  isPosVisible?: boolean;

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: StockStateFilter, default: StockStateFilter.ALL })
  @IsOptional() @IsEnum(StockStateFilter)
  stockState?: StockStateFilter = StockStateFilter.ALL;
}
```

### Service skeleton

```ts
@Injectable()
export class InventoryLocationStockService {
  constructor(private readonly dataSource: DataSource) {}

  async getStockByLocation(locationId: string, query: StockByLocationQueryDto, actor: ActorContext) {
    const location = await this.resolveLocation(locationId, actor.organizationId);

    const { sql, params } = this.buildQuery(locationId, actor.organizationId, query);
    const rows = await this.dataSource.query(sql, params);
    const total = await this.countMatching(locationId, actor.organizationId, query);

    return {
      data: rows.map((r) => this.mapRow(r)),
      meta: {
        location,
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }

  private async resolveLocation(locationId: string, orgId: string) { /* SELECT loc + storage + branch, 404 nếu null */ }
  private buildQuery(/* ... */) { /* xem filter mapping trong EPIC */ }
  private async countMatching(/* ... */) { /* COUNT(*) cùng WHERE */ }
  private mapRow(row: any): StockByLocationItem { /* parse barcodes, providers, compute belowMin */ }
}
```

### Filter mapping → SQL (chi tiết)

| Query param          | WHERE clause                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `search`             | `(i.code ILIKE $S OR i.name ILIKE $S)` với `$S = %escape(search)%`                                    |
| `barcode`            | `EXISTS (SELECT 1 FROM item_barcodes ib WHERE ib.item_id = i.id AND ib.code = $B AND ib.organization_id = $ORG)` |
| `categoryId`         | `i.category_id = $CAT`                                                                                |
| `providerId`         | `EXISTS (SELECT 1 FROM item_providers ip WHERE ip.item_id = i.id AND ip.provider_id = $PROV)`         |
| `isPosVisible`       | `i.is_pos_visible = $POS`                                                                             |
| `isActive`           | `i.is_active = $ACT`                                                                                  |
| `stockState=positive` | `sb.quantity > 0`                                                                                    |
| `stockState=zero`    | `sb.quantity = 0`                                                                                     |
| `stockState=negative` | `sb.quantity < 0`                                                                                    |
| `stockState=below-min` | `th.min_qty IS NOT NULL AND sb.quantity < th.min_qty`                                               |
| `stockState=all`     | — (không thêm WHERE)                                                                                  |

### Aggregate barcodes + providers (tránh N+1)

```sql
SELECT
  sb.item_id, sb.location_id, sb.quantity::text AS quantity, sb.last_movement_at,
  i.code, i.name, i.unit, i.category_id, i.product_id, i.variant_label,
  i.is_pos_visible, i.is_active, i.selling_price::text, i.purchase_price::text,
  cat.name AS category_name,
  th.min_qty::text AS min_qty, th.max_qty::text AS max_qty,
  COALESCE(bc.codes, '{}') AS barcodes,
  COALESCE(prov.list, '[]'::json) AS providers
FROM stock_balances sb
INNER JOIN items i
  ON i.id = sb.item_id AND i.organization_id = sb.organization_id
LEFT JOIN inventory_item_categories cat
  ON cat.id = i.category_id
LEFT JOIN item_stock_thresholds th
  ON th.item_id = i.id AND th.location_id = sb.location_id
LEFT JOIN LATERAL (
  SELECT array_agg(ib.code) AS codes
  FROM item_barcodes ib
  WHERE ib.item_id = i.id AND ib.organization_id = sb.organization_id
) bc ON true
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object(
    'providerId', ip.provider_id,
    'providerName', p.name,
    'isPrimary', ip.is_primary
  )) AS list
  FROM item_providers ip
  INNER JOIN inventory_providers p ON p.id = ip.provider_id
  WHERE ip.item_id = i.id
) prov ON true
WHERE sb.organization_id = $1
  AND sb.location_id = $2
  -- + dynamic filter clauses
ORDER BY i.name ASC
LIMIT $L OFFSET $O;
```

### Helper tái sử dụng

- `PaginationQueryDto` từ `apps/api/src/modules/crud/dto`.
- `ActorContext` từ `apps/api/src/common/decorators/actor-context.decorator.ts`.

## Testing Strategy

- Unit (`inventory-location-stock.service.spec.ts`):
  - Seed: 1 org, 1 branch, 1 storage, 2 location, 5 item (1 inactive, 1 not-pos-visible), 8 stock_balance row (mix âm/dương/zero), 4 barcode, 2 category, 3 provider, 4 threshold (1 below-min).
  - 8 filter cases (1 case mỗi filter, kiểm tra số lượng row + nội dung).
  - 5 stockState cases.
  - Pagination edge: page=2 với pageSize=2.
  - 404 case: `locationId` không tồn tại / khác org.
- Integration (optional ở ticket này — đầy đủ e2e ở TKT-069).

## Dependencies

- Phụ thuộc: EPIC-003, EPIC-010 (item_barcodes, item_stock_thresholds, item_providers đã có).
- Blocks: TKT-068, TKT-069.
