import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DateRangeFilterDto } from '../../../common/filters/filter.dto';

/**
 * Filters for the held-draft invoice picker
 * (POST /v2/invoices/drafts/search). `search` ORs over invoice code / customer
 * name / customer phone. `sessionId` is optional (see TKT-PIS-03 scoping note).
 */
export class DraftInvoiceSearchV2Dto {
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

  /** Free-text: matches invoice code OR customer name OR customer phone */
  @IsOptional()
  @IsString()
  search?: string;

  /** Creation date */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Optional POS session scope */
  @IsOptional()
  @IsString()
  sessionId?: string;
}
