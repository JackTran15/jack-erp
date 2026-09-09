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
import { CashPaymentPurpose, CashVoucherPartnerType } from '../../enums';
import { CashPaymentLineDto } from './cash-payment-line.dto';

/** Update a DRAFT cash payment. `lines` (when provided) is a full upsert set. */
export class UpdateCashPaymentDto {
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
  @IsEnum(CashPaymentPurpose)
  purpose?: CashPaymentPurpose;

  @IsOptional()
  @IsEnum(CashVoucherPartnerType)
  partnerType?: CashVoucherPartnerType;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /**
   * "Đối tượng" typed by hand. Frozen onto the voucher as
   * `partner_name_snapshot` regardless of `partnerType` — for a catalogue
   * party it overrides the catalogue name but leaves `partnerId` untouched
   * (ADR-02).
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  partnerName?: string;

  /**
   * "Địa chỉ" — the payee's address as typed on the voucher. Stored as
   * `partnerAddressSnapshot`; when omitted, posting falls back to the
   * partner record's current address (ADR-03).
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

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
