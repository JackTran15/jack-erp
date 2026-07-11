import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { StockLedgerService } from './stock-ledger.service';
import { SetBalanceTrackingDto } from './dto/set-balance-tracking.dto';
import { StockMovementType } from '@erp/shared-interfaces';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsIn,
  IsNumber,
} from 'class-validator';
import { ApiOkResponse, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STRING_FILTER_MODES,
  NUMERIC_FILTER_OPS,
  type StringFilterMode,
  type NumericFilterOp,
} from './balance-filter.constants';

function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase();
  return v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : undefined;
}

class InstantAverageCostDto {
  @ApiProperty({ format: 'uuid' })
  itemId: string;

  @ApiProperty({ format: 'uuid' })
  branchId: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  inventoryValue: number;

  @ApiProperty()
  unitCost: number;

  @ApiProperty({ enum: ['LEDGER', 'PURCHASE_PRICE_FALLBACK'] })
  source: 'LEDGER' | 'PURCHASE_PRICE_FALLBACK';
}

export class BalanceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  storageId?: string;

  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  belowMin?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  unassigned?: boolean;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái theo dõi hàng hóa (item.is_active). Bỏ trống = tất cả.',
  })
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Lọc theo trạng thái theo dõi vị trí (stock_balances.is_tracked). Bỏ trống = tất cả.',
  })
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  isTracked?: boolean;

  // Per-column string filters
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(STRING_FILTER_MODES)
  locationCodeMode?: StringFilterMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(STRING_FILTER_MODES)
  locationNameMode?: StringFilterMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(STRING_FILTER_MODES)
  itemCodeMode?: StringFilterMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(STRING_FILTER_MODES)
  itemNameMode?: StringFilterMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(STRING_FILTER_MODES)
  categoryNameMode?: StringFilterMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(STRING_FILTER_MODES)
  unitMode?: StringFilterMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storageName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(STRING_FILTER_MODES)
  storageNameMode?: StringFilterMode;

  // When `quantity` is set without `quantityOp`, the service defaults to 'eq'.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(NUMERIC_FILTER_OPS)
  quantityOp?: NumericFilterOp;
}

export class LedgerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;
}

@Controller('inventory/stock')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockLedgerController {
  constructor(private readonly service: StockLedgerService) {}

  @Get('balances')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  listBalances(
    @Query() query: BalanceQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getBalances({
      ...query,
      organizationId: actor.organizationId,
      // Actor.branchId is resolved from the validated X-Branch-Id/JWT authentication context.
      branchId: actor.branchId,
    });
  }

  // Bulk toggle location-level tracking (stock_balances.is_tracked) for the
  // Chi tiết vị trí screen — "Ngừng theo dõi" / bật lại. Does NOT touch item.is_active.
  @Patch('balances/tracking')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  setBalanceTracking(
    @Body() dto: SetBalanceTrackingDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.setBalanceTracking(dto.entries, dto.isTracked, actor);
  }

  @Get('items/:itemId/average-cost')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOkResponse({ type: InstantAverageCostDto })
  getInstantAverageCost(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getInstantAverageCost(
      itemId,
      actor.organizationId,
      actor.branchId!,
    );
  }

  @Get('balances/:itemId/:locationId')
  @RequirePermission('inventory.read')
  async getBalance(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Actor() actor: ActorContext,
  ) {
    const balance = await this.service.getBalance(
      itemId,
      locationId,
      actor.organizationId,
    );
    if (!balance) {
      throw new NotFoundException(
        `No balance found for item ${itemId} at location ${locationId}`,
      );
    }
    return balance;
  }

  @Get('ledger')
  @RequirePermission('inventory.read')
  listLedgerEntries(
    @Query() query: LedgerQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getLedgerEntries({
      ...query,
      organizationId: actor.organizationId,
    });
  }
}
