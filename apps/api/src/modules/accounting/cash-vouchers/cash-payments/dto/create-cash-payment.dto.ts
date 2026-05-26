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

  /** Contra GL account for the whole voucher (per-header, e.g. 331/811). */
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
  @Type(() => CashPaymentLineDto)
  lines: CashPaymentLineDto[];
}
