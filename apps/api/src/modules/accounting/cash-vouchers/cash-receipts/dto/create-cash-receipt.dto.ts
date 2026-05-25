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
import { CashReceiptPurpose, CashVoucherPartnerType } from '../../enums';
import { CashReceiptLineDto } from './cash-receipt-line.dto';

export class CreateCashReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNumber?: string;

  /** "Ngày thu" (YYYY-MM-DD). */
  @IsISO8601()
  voucherDate: string;

  @IsOptional()
  @IsEnum(CashReceiptPurpose)
  purpose?: CashReceiptPurpose;

  @IsOptional()
  @IsEnum(CashVoucherPartnerType)
  partnerType?: CashVoucherPartnerType;

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

  /** Cashier (thủ quỹ). */
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsUUID()
  cashAccountId: string;

  /** Contra GL account for the whole voucher (per-header, e.g. 511/131/711). */
  @IsUUID()
  contraAccountId: string;

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
  @Type(() => CashReceiptLineDto)
  lines: CashReceiptLineDto[];
}
