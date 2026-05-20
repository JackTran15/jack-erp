import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

export enum StockStateFilter {
  ALL = 'ALL',
  IN_STOCK = 'IN_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  NEGATIVE = 'NEGATIVE',
}

export class StockSummaryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'ILIKE on item.code or item.name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  storageId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'ILIKE on item.brand' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Exact match on item.unit' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({
    description: 'Filter by item.is_active (Trạng thái kinh doanh).',
  })
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by item.is_pos_visible (Trạng thái giao dịch).',
  })
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  isPosVisible?: boolean;

  @ApiPropertyOptional({
    enum: StockStateFilter,
    description:
      'Post-aggregate filter on SUM(quantity): IN_STOCK > 0, OUT_OF_STOCK = 0, NEGATIVE < 0, ALL = no filter.',
  })
  @IsOptional()
  @IsEnum(StockStateFilter)
  stockState?: StockStateFilter;

  @ApiPropertyOptional({
    format: 'date',
    description:
      'Filter rows with last_movement_at >= movementFrom (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsDateString()
  movementFrom?: string;

  @ApiPropertyOptional({
    format: 'date',
    description:
      'Filter rows with last_movement_at <= movementTo end-of-day (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsDateString()
  movementTo?: string;
}
