import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Server-side search request for the Chuyển kho (stock transfer) list.
 * Filterable columns mirror what `StockTransferPage` renders:
 * Ngày, Số phiếu chuyển, Đối tượng (Người vận chuyển), Tổng tiền, Diễn giải.
 */
export class StockTransferSearchV2Dto {
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

  /** Số phiếu chuyển (document number) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Đối tượng (counterparty — matches the transporter user's full name) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  party?: StringFilterDto;

  /** Diễn giải (notes) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  notes?: StringFilterDto;

  /** Ngày (transfer date — single date + compare operator =/<\/<=/>/>=) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  date?: CompareFilterDto;

  /** Khoảng thời gian (Từ ngày / Đến ngày từ thanh PeriodFilter) — inclusive. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  dateRange?: DateRangeFilterDto;

  /** Tổng tiền (computed line total: SUM(line_value)) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  totalAmount?: CompareFilterDto;
}
