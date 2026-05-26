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
import { CashVoucherPartnerType } from '../../enums';

/** One invoice debt to settle, with the amount collected against it. */
export class DebtCollectionAllocationDto {
  @IsUUID()
  invoiceDebtId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

/**
 * Create + post a "Phiếu Thu" with purpose=DEBT_COLLECTION that settles the
 * selected invoice debts and credits the branch cash fund (két), all in one
 * ACID transaction orchestrated as a saga.
 */
export class CreateDebtCollectionReceiptDto {
  /** "Ngày thu" (YYYY-MM-DD). */
  @IsISO8601()
  voucherDate: string;

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

  /** "Lý do thu" */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Cashier (thủ quỹ). */
  @IsOptional()
  @IsUUID()
  staffId?: string;

  /** Target cash fund (két). Defaults to the branch's single fund when omitted. */
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DebtCollectionAllocationDto)
  allocations: DebtCollectionAllocationDto[];
}
