import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosDailySummaryDetailCategory } from '@erp/shared-interfaces';
import { DateRangeFilterDto } from '../../../../common/filters/filter.dto';
import { ColumnFilterDto } from './column-filter.dto';

/**
 * Request for a "xem chi tiết" drill-down under the POS daily summary
 * ("Báo cáo theo ngày" → "Tổng hợp"). Same scope filters as
 * {@link PosDailySummaryDto}, plus the category being drilled into and
 * pagination/column filters for the resulting row list.
 */
export class PosDailySummaryDetailDto {
  @ApiProperty({
    type: DateRangeFilterDto,
    description: 'Issued-at window (ISO from/to). Both bounds optional.',
  })
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  issuedAt: DateRangeFilterDto;

  @ApiProperty({ enum: PosDailySummaryDetailCategory })
  @IsEnum(PosDailySummaryDetailCategory)
  category: PosDailySummaryDetailCategory;

  @ApiPropertyOptional({ description: 'Target branch id (defaults to actor branch).' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by cashier (invoice.staffId).' })
  @IsOptional()
  @IsUUID()
  cashierId?: string;

  @ApiPropertyOptional({ description: 'Filter by salesperson (invoice.salespersonId).' })
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Invoice statuses to include; defaults to all except cancelled.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceStatus?: string[];

  @ApiPropertyOptional({ type: [ColumnFilterDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnFilterDto)
  columnFilters?: ColumnFilterDto[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
