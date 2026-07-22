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
import { BankVoucherPartnerType } from '../../enums';

/** One invoice debt to settle, with the amount collected against it. */
export class DepositDebtCollectionAllocationDto {
  @IsUUID()
  invoiceDebtId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

/**
 * Create + post a "Phiếu thu tiền gửi" with purpose=DEBT_COLLECTION that settles
 * the selected invoice debts and credits a deposit fund, all in one ACID
 * transaction orchestrated as a saga. Mirrors the cash flow's
 * `CreateDebtCollectionReceiptDto`, with the deposit fund replacing the két.
 */
export class CreateDepositDebtCollectionReceiptDto {
  /** "Ngày thu" (YYYY-MM-DD). */
  @IsISO8601()
  docDate: string;

  /** "Tài khoản nhận" — the deposit fund credited. Required. */
  @IsUUID()
  depositAccountId: string;

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

  /** "Địa chỉ" — frozen onto the voucher as `partnerAddressSnapshot`. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /** "Lý do thu" */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Cashier (thủ quỹ). */
  @IsOptional()
  @IsUUID()
  collectedBy?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DepositDebtCollectionAllocationDto)
  allocations: DepositDebtCollectionAllocationDto[];
}
