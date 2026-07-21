import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  StringFilterDto,
} from '../../../../../common/filters/filter.dto';

/**
 * Request body for the cash detail ledger (`POST /v2/cash-ledger/search`).
 *
 * Adds per-column filtering to a grid that had none. `balance` is computed per
 * page from the ordered row stream and is deliberately not filterable — it is
 * not a stored value.
 */
export class CashLedgerSearchV2Dto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  /** Omit to use the branch's single cash fund. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  /**
   * Movement date column, also fed by the period filter. `cash_movements` has no
   * document date, so `created_at` is the ledger's date. `from` doubles as the
   * opening-balance cutoff.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Receipt/payment number column — one filter over the shared document number. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Description column, resolved from the source voucher's reason. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  description?: StringFilterDto;

  /** Counterparty column, resolved from the source voucher. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  counterparty?: StringFilterDto;

  /** Staff column, resolved from the source voucher's staff user. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  staff?: StringFilterDto;

  /** Money-in column; also constrains the row to inbound movements. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  amountIn?: CompareFilterDto;

  /** Money-out column; also constrains the row to outbound movements. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  amountOut?: CompareFilterDto;
}
