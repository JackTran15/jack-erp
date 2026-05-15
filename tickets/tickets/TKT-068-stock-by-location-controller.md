# TKT-068 Stock-by-location controller + OpenAPI

## Epic

[EPIC-013 Stock-by-Location Query API](../epics/EPIC-013-stock-by-location-api.md)

## Summary

Phơi `InventoryLocationStockService` ra HTTP qua endpoint `GET /inventory/locations/:locationId/stock-items`, áp guard chain chuẩn (Auth + Permission + BranchScope), document Swagger đầy đủ, đăng ký module và regen `@erp/api-client`.

## Deliverables

- `apps/api/src/modules/inventory/location/inventory-location-stock.controller.ts` (mới):
  - Route prefix `inventory/locations`.
  - Method `GET :locationId/stock-items`.
  - `@UseInterceptors(AuditInterceptor)`, `@UseGuards(PermissionGuard, BranchScopeGuard)`.
  - `@RequirePermission('inventory.read')`, `@RequireBranchScope()`.
  - `@ApiTags('inventory')`, `@ApiOperation`, `@ApiResponse(200/403/404)`, `@ApiQuery` cho từng filter.
- `apps/api/src/modules/inventory/location/dto/stock-by-location.response.dto.ts` (mới) — class với `@ApiProperty` cho mọi field, dùng cho `@ApiResponse({ type: ... })`.
- Đăng ký `InventoryLocationStockController` + `InventoryLocationStockService` vào `InventoryLocationModule`.
- Regen OpenAPI:
  - Chạy API local, `pnpm openapi:generate`.
  - Commit `packages/api-client/openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`.

## Acceptance Criteria

- [ ] `GET /inventory/locations/:locationId/stock-items` trả 200 với body `{ data: [...], meta: { location, total, page, pageSize } }`.
- [ ] Body validate đúng — gửi `pageSize=999` → 400 (vượt max), `stockState=foo` → 400, `categoryId` không phải UUID → 400.
- [ ] `locationId` không tồn tại / khác org → 404.
- [ ] Token có scope branch khác → 403 (`BranchScopeGuard` từ chối vì `location.storage.branch_id` ≠ `X-Branch-Id` header).
- [ ] Token thiếu permission `inventory.read` → 403.
- [ ] Token không có → 401.
- [ ] Swagger UI tại `/docs` hiển thị endpoint mới với mọi query param + response schema.
- [ ] `packages/api-client/src/generated/schema.ts` chứa path `/inventory/locations/{locationId}/stock-items`.

## Definition of Done

- [ ] PR pass `pnpm --filter @erp/api test`, `pnpm --filter @erp/api lint`.
- [ ] `pnpm openapi:generate` không có diff "khác mong đợi" — chỉ thêm endpoint mới, không thay đổi endpoint cũ.
- [ ] Manual smoke test qua `curl` với 3 case: happy, 404, 403 — pass.

## Tech Approach

### Controller

```ts
@ApiTags('inventory')
@Controller('inventory/locations')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class InventoryLocationStockController {
  constructor(private readonly service: InventoryLocationStockService) {}

  @Get(':locationId/stock-items')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOperation({ summary: 'List items + stock tại 1 location' })
  @ApiResponse({ status: 200, type: StockByLocationResponseDto })
  @ApiResponse({ status: 404, description: 'Location không tồn tại hoặc khác org' })
  @ApiResponse({ status: 403, description: 'Sai branch scope hoặc thiếu permission' })
  list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: StockByLocationQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getStockByLocation(locationId, query, actor);
  }
}
```

### Response DTO (Swagger)

```ts
export class StockByLocationItemDto {
  @ApiProperty() itemId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiPropertyOptional() categoryId?: string;
  @ApiPropertyOptional() categoryName?: string;
  @ApiPropertyOptional() productId?: string;
  @ApiPropertyOptional() variantLabel?: string;
  @ApiProperty() isPosVisible: boolean;
  @ApiProperty() isActive: boolean;
  @ApiProperty() sellingPrice: number;
  @ApiProperty() purchasePrice: number;
  @ApiProperty({ type: [String] }) barcodes: string[];
  @ApiProperty({ type: [StockByLocationProviderDto] }) providers: StockByLocationProviderDto[];
  @ApiProperty() quantity: number;
  @ApiPropertyOptional() minQty: number | null;
  @ApiPropertyOptional() maxQty: number | null;
  @ApiProperty() belowMin: boolean;
  @ApiPropertyOptional() lastMovementAt: string | null;
}

export class StockByLocationMetaDto {
  @ApiProperty() location: StockByLocationLocationDto;
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class StockByLocationResponseDto {
  @ApiProperty({ type: [StockByLocationItemDto] }) data: StockByLocationItemDto[];
  @ApiProperty({ type: StockByLocationMetaDto }) meta: StockByLocationMetaDto;
}
```

### Module wiring

`inventory-location.module.ts` cần:

```ts
@Module({
  imports: [TypeOrmModule.forFeature([/* … existing entities … */])],
  controllers: [
    /* existing */,
    InventoryLocationStockController,
  ],
  providers: [
    /* existing */,
    InventoryLocationStockService,
  ],
})
export class InventoryLocationModule { /* ... */ }
```

### Regen API client

```bash
make dev-api &              # API phải chạy
pnpm openapi:generate
git add packages/api-client/openapi.snapshot.json packages/api-client/src/generated/schema.ts
```

## Testing Strategy

- Smoke manual: `curl` 3 case (happy/404/403) trước khi merge.
- E2E đầy đủ chuyển sang TKT-069.

## Dependencies

- Phụ thuộc: TKT-067.
- Blocks: TKT-069.
