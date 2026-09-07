import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Server-side search over the lines of ONE goods receipt — the receipt-side twin
 * of `GoodsIssueLineSearchV2Dto`, and deliberately the same shape (ADR-06).
 *
 * The filterable set is smaller than the grid's column set, and smaller here
 * than on the issue side, because this grid has more columns: Kho, Vị trí and
 * Đơn vị tính are excluded for the same reason as there (ADR-07), and so are the
 * discount and tax columns (% CK, Tiền CK, Thuế suất, Tiền thuế, Tiền thanh
 * toán). All of those carry `filterable: false` on the client so they render no
 * input — a typable box over a field the server ignores is worse than no box.
 *
 * `quantity` is named after the entity column, not after the grid's column key.
 * The receipt grid calls that column `orderedQuantity`; sending that name here
 * would trip `forbidNonWhitelisted` and come back as a 400 that looks exactly
 * like a network error.
 *
 * No sort field, on purpose — see the issue-side DTO.
 */
export class GoodsReceiptLineSearchV2Dto {
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

  /** Mã SKU — matches `items.code`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  itemCode?: StringFilterDto;

  /** Tên hàng hóa — matches `items.name`. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  itemName?: StringFilterDto;

  /** Số lượng */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  quantity?: CompareFilterDto;

  /** Đơn giá */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  unitPrice?: CompareFilterDto;

  /** Thành tiền — `quantity * unit_price`, see LINE_AMOUNT_EXPRESSION. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  lineTotal?: CompareFilterDto;
}
