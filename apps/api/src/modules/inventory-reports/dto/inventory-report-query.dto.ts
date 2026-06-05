import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;
}
