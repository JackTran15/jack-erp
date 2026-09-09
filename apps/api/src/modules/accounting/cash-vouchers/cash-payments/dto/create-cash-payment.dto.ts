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

export class CreateCashPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNumber?: string;

  /** "Ngày chi" (YYYY-MM-DD). */
  @IsISO8601()
  voucherDate: string;

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

  /** "Người nhận" */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payeeName?: string;

  /** "Lý do chi" */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Cashier (thủ quỹ). */
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsUUID()
  cashAccountId: string;

  /**
   * Optional contra GL account override. Normally the contra account is resolved
   * server-side from {@link purpose}; this is only honoured for cases where the
   * cashier explicitly picks the offsetting account (e.g. a transfer destination).
   */
  @IsOptional()
  @IsUUID()
  contraAccountId?: string;

  /** Denormalized total — must equal sum(lines.amount). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CashPaymentLineDto)
  lines: CashPaymentLineDto[];
}
