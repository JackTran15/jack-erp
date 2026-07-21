import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';
import {
  CashVoucherDocumentKind,
  CashVoucherKind,
  CashVoucherStatus,
} from '../enums';

/**
 * Request body for the merged cash voucher search (`POST /v2/cash-vouchers/search`).
 *
 * One row stream over `cash_receipts` + `cash_payments`, which the treasury
 * "receipts and expenses" grid previously merged client-side from two separate
 * list calls capped at 100 rows each. Every filter maps 1:1 to a grid column.
 */
export class CashVoucherSearchV2Dto {
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

  /** Restrict to a single cash fund; omitted = every fund in branch scope. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  /**
   * Creation-timestamp column, also fed by the period (from/to) filter. The grid
   * orders on this column too.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Document number column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  /** Document type column — receipt, payment, or goods-receipt payment. */
  @ApiPropertyOptional({ enum: CashVoucherDocumentKind })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  documentKind?: EnumFilterDto;

  /** Status column. */
  @ApiPropertyOptional({ enum: CashVoucherStatus })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Total amount column. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  totalAmount?: CompareFilterDto;

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
export class CashVoucherRowDto {
  @ApiProperty({ enum: CashVoucherDocumentKind })
  documentKind!: CashVoucherDocumentKind;

  @ApiProperty({
    enum: CashVoucherKind,
    description: 'Source table — drives which detail endpoint and dialog the row opens',
  })
  kind!: CashVoucherKind;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ description: 'ISO date (no time component)' })
  voucherDate!: string;

  @ApiProperty({ nullable: true })
  documentNumber!: string | null;

  @ApiProperty({ enum: CashVoucherStatus })
  status!: CashVoucherStatus;

  @ApiProperty({ description: 'Money, serialized as a number' })
  totalAmount!: number;

  @ApiProperty()
  cashAccountId!: string;

  @ApiProperty({ nullable: true })
  referenceType!: string | null;

  @ApiProperty({ description: 'Payer/payee, falling back to the partner snapshot ("" when none)' })
  counterparty!: string;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

/** Paginated envelope. `totalAmount` spans the whole filtered set, not just the page. */
export class CashVoucherSearchV2ResponseDto {
  @ApiProperty({ type: [CashVoucherRowDto] })
  data!: CashVoucherRowDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'SUM(total_amount) over every matching row, not only this page' })
  totalAmount!: number;
}
