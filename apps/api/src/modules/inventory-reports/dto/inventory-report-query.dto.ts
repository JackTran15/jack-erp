import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MAX_REPORT_ROWS } from '../../reporting/report-core/row-cap.util';
import { ITEM_GROUP_BY_VALUES, type ItemGroupBy } from '../services/stock-period.service';
import { ReportColumnFilterDto } from './report-column-filter.dto';

export { ItemGroupBy };

export const PERIOD_PRESETS = [
  'today',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
  'custom',
] as const;

export type PeriodPresetLiteral = typeof PERIOD_PRESETS[number];

/**
 * `columnFilters` arrives as a JSON string on these GET endpoints. Malformed
 * JSON is left as-is so `@IsObject()` rejects it with a 400 rather than the
 * request silently proceeding unfiltered.
 */
function parseColumnFilters(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

/** Shared query params for every inventory report endpoint. */
export class InventoryReportQueryDto {
  @ApiPropertyOptional({ enum: PERIOD_PRESETS, default: 'this_month' })
  @IsOptional()
  @IsString()
  @IsIn(PERIOD_PRESETS as unknown as string[])
  preset?: PeriodPresetLiteral;

  @ApiPropertyOptional({
    format: 'date',
    description: 'ISO date (yyyy-MM-dd). Required when preset=custom.',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Branch IDs to filter; empty = all visible',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Item category IDs to filter',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Location/warehouse IDs to filter',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  @ApiPropertyOptional({
    enum: ITEM_GROUP_BY_VALUES,
    default: 'item',
    description: 'Item-dimension grouping: item (per SKU), parent (per product), group (per category)',
  })
  @IsOptional()
  @IsIn(ITEM_GROUP_BY_VALUES as unknown as string[])
  itemGroupBy?: ItemGroupBy;

  @ApiPropertyOptional({ description: 'Full-text search on item code/name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: MAX_REPORT_ROWS,
    description:
      'Trần dùng chung với báo cáo chuỗi (MAX_REPORT_ROWS). Trước đây chặn ở 200 vì lưới tự phân trang phía client.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_REPORT_ROWS)
  pageSize?: number = 20;

  @ApiPropertyOptional({
    type: 'string',
    description:
      'Lọc theo cột, dạng JSON: {"outQty":{"operator":">=","value":10}}. Khoá là tên field của dòng. ' +
      'Áp ở tầng ngoài cùng của truy vấn nên tác dụng trên toàn tập, không chỉ trang đang xem.',
    example: '{"outQty":{"operator":">=","value":10}}',
  })
  @IsOptional()
  // These are GET endpoints and Express is running the simple query parser, so
  // `columnFilters[x][operator]` arrives as a literal key rather than a nested
  // object. A single JSON value is unambiguous and survives any parser.
  //
  // No @ValidateNested here on purpose: the keys are column names chosen at
  // runtime, and the global `forbidNonWhitelisted` pipe would reject every one
  // of them as an unknown property. The values are validated where they are
  // turned into SQL — `buildReportColumnFilter` rejects a column the report
  // cannot filter and ignores a blank or non-numeric value.
  @Transform(({ value }) => parseColumnFilters(value))
  @IsObject()
  columnFilters?: Record<string, ReportColumnFilterDto>;
}
