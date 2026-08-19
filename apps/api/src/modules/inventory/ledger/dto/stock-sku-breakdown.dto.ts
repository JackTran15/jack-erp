import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import {
  CompareFilterDto,
  StringFilterDto,
} from "../../../../common/filters/filter.dto";

/**
 * "Chi tiết hàng hóa" — the variants of one SKU inside one storage, broken
 * down by location.
 */
export class StockSkuBreakdownDto {
  /**
   * The grid row's `groupKey`: the parent product id, or the item id for items
   * that have no parent. Rows whose `storageId` starts with `pending:` are
   * synthetic incoming-transfer rows with nothing to break down — the client
   * must not open the dialog for them.
   */
  @IsUUID()
  groupKey: string;

  @IsUUID()
  storageId: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  excludeReservations?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  itemCode?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  itemName?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  unit?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  locationCode?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  locationName?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  quantity?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  openingQty?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  inQty?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  outQty?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  transferOutQty?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  incomingQty?: CompareFilterDto;
}
