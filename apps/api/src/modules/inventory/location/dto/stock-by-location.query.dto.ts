import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { StockStateFilter } from '@erp/shared-interfaces';

const STOCK_BY_LOCATION_SORTABLE = [
  'code',
  'name',
  'quantity',
  'lastMovementAt',
] as const;
export type StockByLocationSortField = (typeof STOCK_BY_LOCATION_SORTABLE)[number];

function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

export class StockByLocationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: STOCK_BY_LOCATION_SORTABLE as unknown as string[],
    default: 'name',
  })
  @IsOptional()
  @IsEnum(STOCK_BY_LOCATION_SORTABLE as unknown as string[])
  sortBy?: StockByLocationSortField = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({ description: 'Partial match on item code & name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;

  @ApiPropertyOptional({ description: 'Exact match on item_barcodes.code' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  barcode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  isPosVisible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => parseBool(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: StockStateFilter, default: StockStateFilter.ALL })
  @IsOptional()
  @IsEnum(StockStateFilter)
  stockState?: StockStateFilter = StockStateFilter.ALL;
}
