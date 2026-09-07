import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CashReceiptPurpose, CashVoucherPartnerType } from '../../enums';
import { CashReceiptLineDto } from './cash-receipt-line.dto';

/**
 * Update a posted cash receipt in place. `lines` (when provided) is a full
 * upsert set, and any change to the total is settled by a compensating cash
 * movement rather than by rewriting the original entry (ADR-01).
 */
export class UpdateCashReceiptDto {
  /**
   * The revision the client last read. Required: editing a posted voucher now
   * moves money, so a blind write must fail loudly rather than silently
   * overwrite a concurrent edit.
   */
  @IsInt()
  @Min(0)
  revision: number;

  @IsOptional()
  @IsISO8601()
  voucherDate?: string;

  @IsOptional()
  @IsEnum(CashReceiptPurpose)
  purpose?: CashReceiptPurpose;

  @IsOptional()
  @IsEnum(CashVoucherPartnerType)
  partnerType?: CashVoucherPartnerType;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /**
   * "Đối tượng" typed by hand. Only read when `partnerType` is `OTHER`; for a
   * catalogue party the name always comes from the resolver instead.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  partnerName?: string;

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
  @Type(() => CashReceiptLineDto)
  lines?: CashReceiptLineDto[];
}
