import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DateRangeFilterDto } from '../../../../common/filters/filter.dto';

/**
 * Scope filters applied PRE-aggregate for debt reports. Structurally optional
 * so the same DTO backs saved templates (which may omit a date range); the
 * search handler / each report definition enforces required fields (e.g.
 * customerId/supplierId) at query time.
 */
export class DebtReportFilterDto {
  /** Report period — enforced present by the report definitions that need it. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  period?: DateRangeFilterDto;

  /**
   * Narrow to a single branch. Absent = org/chain-wide aggregation (the
   * default for every debt report). Customer-debt reports ignore this field
   * entirely (they always aggregate across every branch the party traded
   * with); supplier-debt reports honor it to narrow from the chain-wide
   * default down to one store.
   */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  customerGroupId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  supplierGroupId?: string;

  /** "Thống kê theo" — supplier-debts-detail-by-document-and-product only. */
  @ApiPropertyOptional({ enum: ['item', 'productTemplate'] })
  @IsOptional()
  @IsIn(['item', 'productTemplate'])
  groupBy?: 'item' | 'productTemplate';
}
