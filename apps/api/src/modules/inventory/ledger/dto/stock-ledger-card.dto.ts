import { Type } from "class-transformer";
import {
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
 * "Chi tiết tồn kho" — the stock card (thẻ kho) of one item inside one storage.
 */
export class StockLedgerCardDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  storageId: string;

  /** Narrows the card to a single location; omit for the whole storage. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

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

  /** `Loại chứng từ` — exact `reference_type`, from the filter-options list. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentType?: StringFilterDto;

  /** `Ngày chứng từ` — the grid's date-compare cell (`=`, `<=`, `>` …). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  documentDate?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  description?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  balanceQty?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  inQty?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  outQty?: CompareFilterDto;
}
