import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';
import { InvoiceType } from '../entities/invoice.entity';

/**
 * Filters for the "quick return" invoice list (POST /v2/invoices/returnable/search).
 * Status stays fixed in the handler; `type` is a caller-facing filter that narrows
 * the handler's SALE + EXCHANGE set down to one document kind.
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

  /**
   * Document kind. Omit for both returnable kinds (SALE + EXCHANGE). RETURN is
   * type-valid but yields an empty set — a pure return has no sold lines.
   */
  @IsOptional()
  @IsEnum(InvoiceType)
  @ApiPropertyOptional({ enum: InvoiceType, example: InvoiceType.EXCHANGE })
  type?: InvoiceType;
}
