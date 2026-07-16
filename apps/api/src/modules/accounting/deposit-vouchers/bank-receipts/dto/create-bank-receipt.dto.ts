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

export class CreateBankReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNumber?: string;

  /** "Tài khoản nhận" — the deposit fund account (FR-04). Required. */
  @IsUUID()
  depositAccountId: string;

  /** "Ngày thu" (YYYY-MM-DD). */
  @IsISO8601()
  docDate: string;

  @IsOptional()
  @IsEnum(BankReceiptPurpose)
  purpose?: BankReceiptPurpose;

  @IsOptional()
  @IsEnum(BankVoucherPartnerType)
  partnerType?: BankVoucherPartnerType;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /** "Người nộp" */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payerName?: string;

  /** "Lý do nộp" */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Cashier who collected (thủ quỹ). */
  @IsOptional()
  @IsUUID()
  collectedBy?: string;

  /** Free-text bank reference (transfer ref / cheque no). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  /** Whether this receipt affects revenue accounts. */
  @IsOptional()
  @IsBoolean()
  affectRevenue?: boolean;

  /**
   * Optional contra GL account override. Normally the contra account is resolved
   * server-side from {@link purpose}; this is only honoured for cases where the
   * cashier explicitly picks the offsetting account (e.g. an inter-branch account).
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
  @Type(() => BankReceiptLineDto)
  lines: BankReceiptLineDto[];
}
