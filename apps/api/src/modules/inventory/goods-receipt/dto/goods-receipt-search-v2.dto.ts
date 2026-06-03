import {
  IsInt,
  IsOptional,
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
} from '../../../../common/filters/filter.dto';

/**
 * Server-side search request for the Nhập kho (goods receipt) list.
 * Filterable columns mirror what `PurchaseOrdersPage` renders:
 * Ngày, Số phiếu nhập, Đối tượng, Tổng tiền, Diễn giải, Lý do, Loại chứng từ.
 */
export class GoodsReceiptSearchV2Dto {
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

  /** Số phiếu nhập (document number) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Đối tượng (counterparty — matches provider.name) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  party?: StringFilterDto;

  /** Diễn giải (description) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  description?: StringFilterDto;

  /** Lý do (reason) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  reason?: StringFilterDto;

  /** Loại chứng từ (purpose enum: OTHER | TRANSFER_IN) */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  purpose?: EnumFilterDto;

  /** Ngày (received date range) */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  date?: DateRangeFilterDto;

  /** Tổng tiền (computed line total: SUM(quantity * unit_price)) */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  totalAmount?: CompareFilterDto;
}
