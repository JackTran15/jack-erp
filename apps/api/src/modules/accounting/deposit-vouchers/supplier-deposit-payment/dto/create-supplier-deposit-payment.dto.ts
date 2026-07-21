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

/** Which fund a payment leg draws from (BR-BUY-03 supports one of each per saga). */
export enum SupplierDepositPaymentFund {
  CASH = 'CASH',
  DEPOSIT = 'DEPOSIT',
}

/** One settled supplier debt, with the amount paid against it. */
export class SupplierDepositPaymentAllocationDto {
  @IsUUID()
  supplierDebtId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

/** One funding leg (CASH or DEPOSIT) contributing toward the total paid amount. */
export class SupplierDepositPaymentLegDto {
  @IsEnum(SupplierDepositPaymentFund)
  fund: SupplierDepositPaymentFund;

  /** Required when fund=DEPOSIT. */
  @IsOptional()
  @IsUUID()
  depositAccountId?: string;

  /** Optional when fund=CASH — defaults to the branch's single fund. */
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

/**
 * Create + post one or two "Phiếu chi" (bank_payment / cash_payment, purpose
 * SUPPLIER_PAYMENT) that settle the selected supplier debts, all in one ACID
 * transaction orchestrated as a saga. `legs` sum must equal `allocations` sum.
 */
export class CreateSupplierDepositPaymentDto {
  /** "Ngày chi" (YYYY-MM-DD). */
  @IsISO8601()
  docDate: string;

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

  /** "Lý do chi" */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierDepositPaymentLegDto)
  legs: SupplierDepositPaymentLegDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierDepositPaymentAllocationDto)
  allocations: SupplierDepositPaymentAllocationDto[];
}
