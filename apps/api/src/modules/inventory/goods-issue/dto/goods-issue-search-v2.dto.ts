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
 * Server-side search request for the Xuất kho (goods issue) list.
 * Filterable columns mirror what `GoodsIssuePage` renders:
 * Ngày, Số phiếu xuất, Đối tượng, Tổng tiền, Diễn giải, Lý do, Loại chứng từ.
 */
export class GoodsIssueSearchV2Dto {
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

  /** Số phiếu xuất (document number) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Đối tượng (counterparty — matches provider.name or targetBranch.name) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  party?: StringFilterDto;

  /** Diễn giải (notes) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  notes?: StringFilterDto;

  /** Lý do (reason) */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  reason?: StringFilterDto;

  /** Loại chứng từ (purpose enum: OTHER | SALE | TRANSFER_OUT | DISPOSAL) */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  purpose?: EnumFilterDto;

  /** Ngày (created date range — GoodsIssueEntity has no dedicated issue date) */
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
