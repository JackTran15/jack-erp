import { ReportGroupBy } from '@erp/shared-interfaces';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { DateRangeFilterDto } from '../../../../common/filters/filter.dto';
import { StoreScopeDto } from './store-scope.dto';

/**
 * Scope filters applied PRE-aggregate for profit reports. Structurally
 * optional so the same DTO backs saved templates (which may omit a date
 * range); each report definition enforces its own required fields at query
 * time (e.g. `issuedAt` for #1/#2, `currentPeriod` for #3).
 */
export class ProfitReportFilterDto {
  /** Single date range — profit-by-item / gross-profit-by-invoice. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  issuedAt?: DateRangeFilterDto;

  /** Comparison period #1 — business-results only. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  previousPeriod?: DateRangeFilterDto;

  /** Comparison period #2 (required by business-results) — business-results only. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  currentPeriod?: DateRangeFilterDto;

  /** Multi-store consolidation scope; absent ⇒ actor's own branch. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreScopeDto)
  store?: StoreScopeDto;

  /** Legacy single-branch narrow (back-compat with the existing search API shape). */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** profit-by-item only — filter by item category (Nhóm hàng hóa). */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** profit-by-item only — row grain (default item). "Hàng hoá" = PARENT, "Mẫu mã" = ITEM, "Nhóm hàng hóa" = GROUP. */
  @ApiPropertyOptional({ enum: ReportGroupBy })
  @IsOptional()
  @IsEnum(ReportGroupBy)
  statBy?: ReportGroupBy;
}
