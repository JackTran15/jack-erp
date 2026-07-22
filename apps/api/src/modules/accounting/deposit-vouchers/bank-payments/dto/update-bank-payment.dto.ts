import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BankPaymentPurpose, BankVoucherPartnerType } from '../../enums';
import { BankPaymentLineDto } from './bank-payment-line.dto';

/** Update a DRAFT bank payment. `lines` (when provided) is a full upsert set. */
export class UpdateBankPaymentDto {
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

  @IsOptional()
  @IsISO8601()
  docDate?: string;

  @IsOptional()
  @IsEnum(BankPaymentPurpose)
  purpose?: BankPaymentPurpose;

  @IsOptional()
  @IsEnum(BankVoucherPartnerType)
  partnerType?: BankVoucherPartnerType;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  payeeName?: string;

  /** "Địa chỉ" — stored as `partnerAddressSnapshot`. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  paidBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @IsBoolean()
  affectExpense?: boolean;

  @IsOptional()
  @IsUUID()
  contraAccountId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BankPaymentLineDto)
  lines?: BankPaymentLineDto[];
}
