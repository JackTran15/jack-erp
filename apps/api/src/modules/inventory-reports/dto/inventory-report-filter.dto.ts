import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  INVENTORY_REPORT_VIEW_MODES,
  InventoryReportViewMode,
  TRANSFER_LEGS,
  TransferLeg,
} from '@erp/shared-interfaces';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DateRangeFilterDto } from '../../../common/filters/filter.dto';
import { StoreScopeDto } from '../../reporting/invoice-report/dto/store-scope.dto';
import { PERIOD_PRESETS, PeriodPresetLiteral } from './period-preset';
import { ITEM_GROUP_BY_VALUES, ItemGroupBy } from '../services/stock-period.service';

/**
 * Scope filters applied PRE-aggregate (engine level) for the inventory
 * reports. Backs `InventoryReportFilterPayload` in shared-interfaces.
 */
export class InventoryReportFilterDto {
  /** Custom period (inclusive ISO dates). Wins over `preset` when set. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  period?: DateRangeFilterDto;

  /** Period preset; used when `period` is absent. Default: this_month. */
  @ApiPropertyOptional({ enum: PERIOD_PRESETS })
  @IsOptional()
  @IsString()
  @IsIn(PERIOD_PRESETS as unknown as string[])
  preset?: PeriodPresetLiteral;

  /** Multi-store scope. Absent or scope="all" ⇒ org-wide (legacy parity). */
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreScopeDto)
  store?: StoreScopeDto;

  /** Storage (warehouse) ids — resolved to their locations by the backend. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  warehouseIds?: string[];

  /** Item category (product group) filter. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Item-dimension grain (default item). */
  @ApiPropertyOptional({ enum: ITEM_GROUP_BY_VALUES })
  @IsOptional()
  @IsIn(ITEM_GROUP_BY_VALUES as unknown as string[])
  statBy?: ItemGroupBy;

  /**
   * Which backoffice view is asking (default single).
   *
   * Only reports whose row shape differs between the two views read it; the
   * rest resolve their scope from `store` alone, as they always have.
   */
  @ApiPropertyOptional({ enum: INVENTORY_REPORT_VIEW_MODES })
  @IsOptional()
  @IsIn(INVENTORY_REPORT_VIEW_MODES as unknown as string[])
  viewMode?: InventoryReportViewMode;

  /** Filter by unit name — applied in-memory on result rows. */
  @IsOptional()
  @IsString()
  unit?: string;

  /** Filter by denormalized item brand — applied in-memory on result rows. */
  @IsOptional()
  @IsString()
  brand?: string;

  /** transfer-by-store only — source branch; default = actor's branch. */
  @IsOptional()
  @IsUUID()
  sourceStoreId?: string;

  /** transfer-by-store only — destination branches. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  receivingStoreIds?: string[];

  /**
   * Transfer document detail only — which leg of the pair is primary.
   *
   * Declared here because the global ValidationPipe runs with
   * `forbidNonWhitelisted`, so an undeclared field makes the whole request 400.
   */
  @ApiPropertyOptional({ enum: TRANSFER_LEGS })
  @IsOptional()
  @IsIn(TRANSFER_LEGS as unknown as string[])
  transferLeg?: TransferLeg;

  /** Hide rows with all-zero measures (stock-period reports; default true). */
  @IsOptional()
  @IsBoolean()
  hideZeroRows?: boolean;

  /** Free-text search on item code/name. */
  @IsOptional()
  @IsString()
  search?: string;
}
