import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  DepositMovementSource,
  DepositMovementType,
  ReconStatus,
} from '@erp/shared-interfaces';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

/**
 * Request body for the deposit reconciliation grid (`POST /v2/deposit-recon/search`).
 *
 * Replaces the v1 query-string list, whose only column filter (transaction type)
 * ran client-side after paging — shrinking the visible page while the summary
 * bar stayed unfiltered. Every filter here runs in SQL, so the grid, the totals
 * and the pager always agree.
 */
export class DepositReconSearchV2Dto {
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

  /** Restrict to a single deposit account; omitted = every account in scope. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

  /** Document number column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Transaction type column. */
  @ApiPropertyOptional({ enum: DepositMovementType })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  type?: EnumFilterDto;

  /** Account column — matches the rendered "name (accountNo)" label. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  accountLabel?: StringFilterDto;

  /**
   * Date column. Matches on COALESCE(value_date, doc_date) — a statement period
   * must match the movement's cleared date, not its transaction date (R2,
   * TKT-DFR-04), otherwise unsettled funds read as a false discrepancy.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  docDate?: DateRangeFilterDto;

  /** Value date (cleared date) column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  valueDate?: DateRangeFilterDto;

  /** Net received amount column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  netAmount?: CompareFilterDto;

  /** Fee column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  feeAmount?: CompareFilterDto;

  /** Gross amount column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  amount?: CompareFilterDto;

  /** Reconciled-by column — matches the resolved user name, not the raw id. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  reconciledBy?: StringFilterDto;

  /** Reconciliation status column. Defaults to CHUA (unreconciled), as v1 did. */
  @ApiPropertyOptional({ enum: ReconStatus, default: ReconStatus.CHUA })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  reconStatus?: EnumFilterDto;
}

/** A movement row with its account and reconciler inlined. */
export class DepositReconRowDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  documentNumber!: string | null;

  @ApiProperty({ enum: DepositMovementType })
  type!: DepositMovementType;

  @ApiProperty()
  depositAccountId!: string;

  @ApiProperty({ description: 'Inlined from deposit_accounts ("" when unresolved)' })
  depositAccountName!: string;

  @ApiProperty({ description: 'Inlined from deposit_accounts ("" when unresolved)' })
  depositAccountNo!: string;

  @ApiProperty()
  docDate!: string;

  @ApiProperty({ nullable: true })
  valueDate!: string | null;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  feeAmount!: number;

  @ApiProperty()
  netAmount!: number;

  @ApiProperty({ enum: ReconStatus })
  reconStatus!: ReconStatus;

  @ApiProperty({ nullable: true, description: 'Raw user id, kept for compatibility' })
  reconciledBy!: string | null;

  @ApiProperty({ nullable: true, description: 'Resolved "first last" ("" when unresolved)' })
  reconciledByName!: string;

  @ApiProperty({ nullable: true })
  reconciledAt!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({
    enum: DepositMovementSource,
    description: 'Which flow produced this movement; POS_INVOICE rows have no voucher',
  })
  source!: DepositMovementSource;

  @ApiProperty({
    nullable: true,
    description: 'Meaning depends on source — invoices.id when source is POS_INVOICE',
  })
  sourceRefId!: string | null;

  @ApiProperty({ nullable: true, description: 'bank_payments.id this movement posted' })
  bankPaymentId!: string | null;

  @ApiProperty({ nullable: true, description: 'bank_receipts.id this movement posted' })
  bankReceiptId!: string | null;
}

/** Paginated envelope. `totalAmount` spans the whole filtered set, not just the page. */
export class DepositReconSearchV2ResponseDto {
  @ApiProperty({ type: [DepositReconRowDto] })
  data!: DepositReconRowDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'SUM(net_amount) over every matching row, not only this page' })
  totalAmount!: number;

  @ApiProperty({ description: 'Any unreconciled movement older than the stale threshold' })
  hasStaleUnreconciled!: boolean;
}
