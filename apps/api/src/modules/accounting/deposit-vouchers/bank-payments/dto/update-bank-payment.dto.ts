import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { BankPaymentPurpose, BankVoucherPartnerType } from '../../enums';
import { BankPaymentLineDto } from './bank-payment-line.dto';

/** Update a DRAFT bank payment. `lines` (when provided) is a full upsert set. */
export class UpdateBankPaymentDto {
  /**
   * The revision the client last read. Required: editing a posted voucher now
   * moves money, so a blind write must fail loudly rather than silently
   * overwrite a concurrent edit.
   */
  @IsInt()
  @Min(0)
  revision: number;

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
