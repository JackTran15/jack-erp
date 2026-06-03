import {
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DateRangeFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

/**
 * Server-side search request for the Nhóm hàng hoá (inventory item categories)
 * admin list. Filterable columns mirror the CrudListPage view: code, name, createdAt.
 */
export class ItemCategorySearchV2Dto {
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

  /** Mã nhóm hàng hóa (category code) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Tên danh mục (category name) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  name?: StringFilterDto;

  /** Ngày tạo (creation date range) */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;
}
