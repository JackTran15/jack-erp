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
import { BankPaymentPurpose, BankVoucherStatus } from '../../enums';

/** Source alias for the `source` filter (maps to reference_type). */
export enum BankPaymentSource {
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
  MANUAL = 'MANUAL',
}

export class QueryBankPaymentDto {
  @IsOptional()
  @IsEnum(BankVoucherStatus)
  status?: BankVoucherStatus;

  @IsOptional()
  @IsEnum(BankPaymentPurpose)
  purpose?: BankPaymentPurpose;

  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

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

  /** Filter by origin (maps to reference_type). */
  @IsOptional()
  @IsEnum(BankPaymentSource)
  source?: BankPaymentSource;

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
