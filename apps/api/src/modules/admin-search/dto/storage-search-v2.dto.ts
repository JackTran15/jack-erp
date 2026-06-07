import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StringFilterDto } from '../../../common/filters/filter.dto';

/**
 * Server-side search request for the Kho lưu trữ (inventory storages) admin list.
 * Filterable columns mirror the StoragesPage view: name, branchId, isMainStorage.
 */
export class StorageSearchV2Dto {
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

  /** Tên kho (storage name) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  /** Exact branch filter (Chi nhánh kho tab) */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Kho chính (default-receiving storage) flag */
  @IsOptional()
  @IsBoolean()
  isMainStorage?: boolean;

  /** Sort column — whitelisted to the columns the list can order by. */
  @IsOptional()
  @IsIn(['name', 'branchId'])
  sortBy?: 'name' | 'branchId';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
