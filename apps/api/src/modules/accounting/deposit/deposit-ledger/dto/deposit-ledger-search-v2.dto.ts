import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ReconStatus } from '@erp/shared-interfaces';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../../../common/filters/filter.dto';

/**
 * Request body for the deposit detail ledger (`POST /v2/deposit-ledger/search`).
 *
 * Adds per-column filtering to a grid that had none. `runningBalance` is
 * computed per page from the ordered row stream and is deliberately not
 * filterable — it is not a stored value.
 */
export class DepositLedgerSearchV2Dto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /**
   * Deposit account to show the ledger for. Omit to include every ACTIVE
   * deposit account of the branch (BR-LEDG-03).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

  /**
   * Document date column, also fed by the period filter. `from` doubles as the
   * opening-balance cutoff.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  docDate?: DateRangeFilterDto;

  /** Receipt/payment number column — one filter over the shared document number. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Account number column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  accountNo?: StringFilterDto;

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

  /** Staff column, resolved from the source voucher's cashier user. */
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

  /** Reconciliation status. */
  @ApiPropertyOptional({ enum: ReconStatus })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  reconStatus?: EnumFilterDto;
}
