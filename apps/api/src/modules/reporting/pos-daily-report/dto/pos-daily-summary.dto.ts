import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DateRangeFilterDto } from '../../../../common/filters/filter.dto';

/**
 * Request for the POS daily report summary ("Báo cáo theo ngày" → "Tổng hợp").
 * A single time window (from–to) scoped to the actor's organization + branch,
 * optionally narrowed by cashier / salesperson. Mirrors the invoice-report
 * filter building blocks but stays minimal (this is not a columnar report).
 */
export class PosDailySummaryDto {
  @ApiProperty({
    type: DateRangeFilterDto,
    description: 'Issued-at window (ISO from/to). Both bounds optional.',
  })
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  issuedAt: DateRangeFilterDto;

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
}
