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
import { BankReceiptPurpose, BankVoucherPartnerType } from '../../enums';
import { BankReceiptLineDto } from './bank-receipt-line.dto';

/** Update a DRAFT bank receipt. `lines` (when provided) is a full upsert set. */
export class UpdateBankReceiptDto {
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

  @IsOptional()
  @IsISO8601()
  docDate?: string;

  @IsOptional()
  @IsEnum(BankReceiptPurpose)
  purpose?: BankReceiptPurpose;

  @IsOptional()
  @IsEnum(BankVoucherPartnerType)
  partnerType?: BankVoucherPartnerType;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  payerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  collectedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @IsBoolean()
  affectRevenue?: boolean;

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
  @Type(() => BankReceiptLineDto)
  lines?: BankReceiptLineDto[];
}
