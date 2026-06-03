import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

/**
 * Filters for a single customer's purchase history
 * (POST /v2/invoices/purchase-history/search). Org-wide for the given customer
 * (history spans stores) — not branch-scoped.
 */
export class PurchaseHistorySearchV2Dto {
  /** Customer whose history is requested */
  @IsUUID()
  customerId: string;

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

  /** Invoice (issued) date */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  issuedAt?: DateRangeFilterDto;

  /** Store / branch name */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  storeName?: StringFilterDto;

  /** Invoice status (null/absent = all) */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Total amount paid */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  totalPaid?: CompareFilterDto;

  /** Note */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  note?: StringFilterDto;
}
