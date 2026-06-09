import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

export class InventoryStockBalanceSearchV2Dto {
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

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  itemName?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  itemCode?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  itemVariants?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  productName?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  variantLabel?: StringFilterDto;

  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  quantity?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  lastMovementAt?: DateRangeFilterDto;
}
