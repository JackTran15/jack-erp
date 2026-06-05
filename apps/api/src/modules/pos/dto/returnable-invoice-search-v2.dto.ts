import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

/**
 * Filters for the "quick return" invoice list (POST /v2/invoices/returnable/search).
 * Only fully-paid sales are returnable, so type/status are fixed in the handler and
 * not exposed here.
 */
export class ReturnableInvoiceSearchV2Dto {
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

  /** Invoice code */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Creation date */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Customer name */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerName?: StringFilterDto;

  /** Customer phone */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerPhone?: StringFilterDto;

  /** Total amount paid */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  totalPaid?: CompareFilterDto;

  /** Branch name */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  branchName?: StringFilterDto;
}
