import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LocationType } from '@erp/shared-interfaces';
import {
  EnumFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Request body for the v2 location search ("Vị trí hàng hóa"). Mirrors the
 * per-column filters of the backoffice list, pushed server-side. Shape matches
 * the backoffice `buildV2Body` convention (StringFilter for text, EnumFilter
 * for id selects, raw booleans for flags).
 */
export class LocationSearchV2Dto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Mã vị trí */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Tên vị trí */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  /** Mô tả */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  description?: StringFilterDto;

  /** Thuộc kho — storage id */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  storageId?: EnumFilterDto;

  /** Trạng thái */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Xếp hàng hóa — true = "Đã xếp" (has ≥1 stock_balance row) */
  @IsOptional()
  @IsBoolean()
  hasItems?: boolean;

  /**
   * Include the virtual "Chưa xếp" location. Defaults to false so it stays
   * hidden from the list, same as `GET /inventory/locations`.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeUnassigned?: boolean;
}

/** A single location row returned by the v2 search. */
export class LocationSearchV2RowDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'uuid' })
  storageId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  branchId!: string | null;

  @ApiProperty({ enum: LocationType })
  type!: LocationType;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ description: 'Đã xếp hàng hóa (has ≥1 stock_balance row)' })
  hasItems!: boolean;
}

/** Paginated envelope returned by the v2 search. */
export class LocationSearchV2ResponseDto {
  @ApiProperty({ type: [LocationSearchV2RowDto] })
  data!: LocationSearchV2RowDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
