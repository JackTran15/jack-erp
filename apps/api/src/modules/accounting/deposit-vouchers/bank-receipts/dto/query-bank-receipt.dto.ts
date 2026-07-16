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
import { BankReceiptPurpose, BankVoucherStatus } from '../../enums';

/** Source alias for the `source` filter (maps to reference_type). */
export enum BankReceiptSource {
  DEBT_COLLECTION = 'DEBT_COLLECTION',
  TRANSFER = 'TRANSFER',
  MANUAL = 'MANUAL',
}

export class QueryBankReceiptDto {
  @IsOptional()
  @IsEnum(BankVoucherStatus)
  status?: BankVoucherStatus;

  @IsOptional()
  @IsEnum(BankReceiptPurpose)
  purpose?: BankReceiptPurpose;

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

  /** ILIKE over document_number, payer_name, reason. */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filter by origin (maps to reference_type). */
  @IsOptional()
  @IsEnum(BankReceiptSource)
  source?: BankReceiptSource;

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
