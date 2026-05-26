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

/** One supplier debt to settle, with the amount paid against it. */
export class SupplierDebtPaymentAllocationDto {
  @IsUUID()
  supplierDebtId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

/**
 * Create + post a "Phiếu Chi" with purpose=SUPPLIER_PAYMENT that settles the
 * selected supplier debts and debits the branch cash fund (két), all in one
 * ACID transaction orchestrated as a saga.
 */
export class CreateSupplierDebtPaymentDto {
  /** "Ngày chi" (YYYY-MM-DD). */
  @IsISO8601()
  voucherDate: string;

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

  /** Source cash fund (két). Defaults to the branch's single fund when omitted. */
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierDebtPaymentAllocationDto)
  allocations: SupplierDebtPaymentAllocationDto[];
}
