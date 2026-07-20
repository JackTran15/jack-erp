import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';
import { BankVoucherStatus, DepositVoucherKind } from '../enums';

/**
 * Request body for the merged deposit voucher search (`POST /v2/deposit-vouchers/search`).
 *
 * One row stream over `bank_receipts` + `bank_payments`, which the treasury
 * "receipts and expenses" grid previously merged client-side from two separate
 * list calls. Every filter maps 1:1 to a grid column.
 */
export class DepositVoucherSearchV2Dto {
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

  /** Document date column, also fed by the period (from/to) filter. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  docDate?: DateRangeFilterDto;

  /** Document number column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Document type column — RECEIPT or PAYMENT. */
  @ApiPropertyOptional({ enum: DepositVoucherKind })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  kind?: EnumFilterDto;

  /** Status column. */
  @ApiPropertyOptional({ enum: BankVoucherStatus })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Total amount column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  totalAmount?: CompareFilterDto;

  /** Account column — matches the rendered "name (accountNo)" label. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  accountLabel?: StringFilterDto;

  /** Payer/payee column, falling back to the partner name snapshot. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  counterparty?: StringFilterDto;

  /** Reason column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  reason?: StringFilterDto;
}

/** A single merged voucher row. */
export class DepositVoucherRowDto {
  @ApiProperty({ enum: DepositVoucherKind })
  kind!: DepositVoucherKind;

  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'ISO date (no time component)' })
  docDate!: string;

  @ApiProperty({ nullable: true })
  documentNumber!: string | null;

  @ApiProperty({ enum: BankVoucherStatus })
  status!: BankVoucherStatus;

  @ApiProperty({ description: 'Money, serialized as a number' })
  totalAmount!: number;

  @ApiProperty()
  depositAccountId!: string;

  @ApiProperty({ description: 'Inlined from deposit_accounts ("" when unresolved)' })
  depositAccountName!: string;

  @ApiProperty({ description: 'Inlined from deposit_accounts ("" when unresolved)' })
  depositAccountNo!: string;

  @ApiProperty({ nullable: true })
  referenceType!: string | null;

  @ApiProperty({ description: 'Payer/payee, falling back to the partner snapshot ("" when none)' })
  counterparty!: string;

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty()
  createdAt!: string;
}

/** Paginated envelope. `totalAmount` spans the whole filtered set, not just the page. */
export class DepositVoucherSearchV2ResponseDto {
  @ApiProperty({ type: [DepositVoucherRowDto] })
  data!: DepositVoucherRowDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'SUM(total_amount) over every matching row, not only this page' })
  totalAmount!: number;
}
