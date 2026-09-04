import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Server-side search over the lines of ONE goods issue — what the line grid in
 * the voucher detail dialog reads (ADR-06).
 *
 * The filterable set is deliberately smaller than the grid's column set. The
 * grid renders a filter cell for every column, but Kho / Vị trí / Đơn vị tính
 * are not offered here (ADR-07): they would need `locations` joined, and in
 * practice nearly every line of a voucher shares one warehouse, so filtering on
 * them returns nearly the whole voucher. Those columns carry `filterable:
 * false` on the client so they render no input at all — a typable box over a
 * field the server ignores is worse than no box.
 *
 * There is intentionally NO sort field, and adding one is not a small change:
 * line order is the voucher's own ordinal and the whole point of `line_no`
 * (ADR-01, ADR-05). Leaving the contract without a sort knob is what keeps
 * "always in line order" enforceable instead of merely conventional.
 *
 * The response envelope is `{ data, total, page, limit, totals }`, where both
 * `total` and `totals` are computed over the MATCHING lines rather than the
 * whole voucher (ADR-08) — once the user has filtered, the sum they are asking
 * about is the sum of what they filtered to.
 */
export class GoodsIssueLineSearchV2Dto {
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
