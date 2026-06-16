import { Type } from "class-transformer";
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
  ValidateNested,
} from "class-validator";
import {
  CompareFilterDto,
  StringFilterDto,
} from "../../../../common/filters/filter.dto";
import { StockStateFilter } from "./stock-summary-query.dto";
import { StockSummaryExportVariant } from "../stock-summary-export.service";

export class StockSummarySearchV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsUUID()
  storageId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  movementFrom?: string;

  @IsOptional()
  @IsDateString()
  movementTo?: string;

  @IsOptional()
  @IsBoolean()
  excludeReservations?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPosVisible?: boolean;

  @IsOptional()
  @IsEnum(StockStateFilter)
  stockState?: StockStateFilter;

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
  category?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  brand?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  storage?: StringFilterDto;

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

export class StockSummaryExportDto extends StockSummarySearchV2Dto {
  @IsEnum(StockSummaryExportVariant)
  variant: StockSummaryExportVariant;
}
