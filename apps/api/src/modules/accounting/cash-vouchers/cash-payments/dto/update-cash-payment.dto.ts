import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
import { CashPaymentPurpose, CashVoucherPartnerType } from '../../enums';
import { CashPaymentLineDto } from './cash-payment-line.dto';

/** Update a DRAFT cash payment. `lines` (when provided) is a full upsert set. */
export class UpdateCashPaymentDto {
  @IsOptional()
  @IsISO8601()
  voucherDate?: string;

  @IsOptional()
  @IsEnum(CashPaymentPurpose)
  purpose?: CashPaymentPurpose;

  @IsOptional()
  @IsEnum(CashVoucherPartnerType)
  partnerType?: CashVoucherPartnerType;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  payeeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

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
  @Type(() => CashPaymentLineDto)
  lines?: CashPaymentLineDto[];
}
