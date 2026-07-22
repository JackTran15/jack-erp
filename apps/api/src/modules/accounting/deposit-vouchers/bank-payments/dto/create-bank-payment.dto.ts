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

export class CreateBankPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNumber?: string;

  /** "Tài khoản chi" — the deposit fund account (FR-05). Required. */
  @IsUUID()
  depositAccountId: string;

  /** "Ngày chi" (YYYY-MM-DD). */
  @IsISO8601()
  docDate: string;

  @IsOptional()
  @IsEnum(BankPaymentPurpose)
  purpose?: BankPaymentPurpose;

  @IsOptional()
  @IsEnum(BankVoucherPartnerType)
  partnerType?: BankVoucherPartnerType;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /** "Người nhận" */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payeeName?: string;

  /**
   * "Địa chỉ" — the payee's address as typed on the voucher. Stored as
   * `partnerAddressSnapshot`; when omitted, posting falls back to the partner
   * record's current address.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /** "Lý do chi" */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Cashier who paid (thủ quỹ). */
  @IsOptional()
  @IsUUID()
  paidBy?: string;

  /** Free-text bank reference (transfer ref / cheque no). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  /**
   * Whether this payment affects expense accounts. Server-side forced to false
   * for fund-move purposes (CASH_TRANSFER / INTER_BRANCH_OUT) — BR-CHI-05.
   */
  @IsOptional()
  @IsBoolean()
  affectExpense?: boolean;

  /**
   * Optional contra GL account override. Normally the contra account is resolved
   * server-side from {@link purpose}; this is only honoured for cases where the
   * cashier explicitly picks the offsetting account (e.g. a cash / inter-branch
   * account for a fund move).
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
  @Type(() => BankPaymentLineDto)
  lines: BankPaymentLineDto[];
}
