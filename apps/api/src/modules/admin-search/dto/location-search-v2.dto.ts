import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EnumFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

/**
 * Server-side search request for the Vị trí hàng hóa (inventory locations) admin
 * list. Filterable columns mirror the ItemLocationsPage view: code, name, type,
 * isActive, plus the storageId scope filter ("Thuộc kho").
 */
export class LocationSearchV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Mã vị trí (location code) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Tên vị trí (location name) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  /** Loại vị trí (SHELF / RACK / BIN / ZONE) */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  type?: EnumFilterDto;

  /** Exact storage filter ("Thuộc kho") */
  @IsOptional()
  @IsUUID()
  storageId?: string;

  /** Trạng thái hoạt động (active flag) */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
