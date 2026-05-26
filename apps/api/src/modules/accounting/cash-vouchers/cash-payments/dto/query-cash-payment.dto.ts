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
import { CashPaymentPurpose, CashVoucherStatus } from '../../enums';

/** Source alias for the `source` filter (maps to reference_type) — TKT-CV-22. */
export enum CashPaymentSource {
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  EXPENSE = 'EXPENSE',
  MANUAL = 'MANUAL',
}

export class QueryCashPaymentDto {
  @IsOptional()
  @IsEnum(CashVoucherStatus)
  status?: CashVoucherStatus;

  @IsOptional()
  @IsEnum(CashPaymentPurpose)
  purpose?: CashPaymentPurpose;

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

  /** ILIKE over document_number, payee_name, reason. */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filter by origin (maps to reference_type) — TKT-CV-22. */
  @IsOptional()
  @IsEnum(CashPaymentSource)
  source?: CashPaymentSource;

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
