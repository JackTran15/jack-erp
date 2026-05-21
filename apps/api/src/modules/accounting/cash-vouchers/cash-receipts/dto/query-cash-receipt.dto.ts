import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CashReceiptPurpose, CashVoucherStatus } from '../../enums';

/** Source alias for the `source` filter (maps to reference_type) — TKT-CV-22. */
export enum CashReceiptSource {
  POS_SALE = 'POS_SALE',
  DEBT_COLLECTION = 'DEBT_COLLECTION',
  MANUAL = 'MANUAL',
}

export class QueryCashReceiptDto {
  @IsOptional()
  @IsEnum(CashVoucherStatus)
  status?: CashVoucherStatus;

  @IsOptional()
  @IsEnum(CashReceiptPurpose)
  purpose?: CashReceiptPurpose;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  /** ILIKE over document_number, payer_name, reason. */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filter by origin (maps to reference_type) — TKT-CV-22. */
  @IsOptional()
  @IsEnum(CashReceiptSource)
  source?: CashReceiptSource;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
