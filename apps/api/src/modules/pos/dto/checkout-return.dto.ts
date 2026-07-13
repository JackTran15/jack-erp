import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RefundMethod } from '../entities/invoice.entity';
import { InvoicePaymentLineDto } from './checkout-invoice.dto';

export class CheckoutReturnDto {
  @IsEnum(RefundMethod)
  refundMethod: RefundMethod;

  @IsUUID()
  revenueAccountId: string;

  /** Required when refundMethod = CASH AND no active drawer session is found. */
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  /** Required when refundMethod = OFFSET against an original AR (debt) invoice. */
  @IsOptional()
  @IsUUID()
  receivableAccountId?: string;

  /** Required when refundMethod = STORE_CREDIT (target liability GL). */
  @IsOptional()
  @IsUUID()
  creditLiabilityAccountId?: string;

  /** Optional expiry date for the issued store credit (ISO date). */
  @IsOptional()
  @IsISO8601()
  creditExpiresAt?: string;

  /** Payments — for EXCHANGE with netAmount > 0. When their sum is below netAmount
   * (and the invoice has a customer) the remainder is booked as customer debt. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentLineDto)
  payments?: InvoicePaymentLineDto[];

  /** Credit due date (ISO `YYYY-MM-DD`) for the debt booked on an EXCHANGE
   * net > 0 that is paid partially/none. Ignored when fully paid. */
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  /** Credit term in days for the EXCHANGE net > 0 debt (per invoice). */
  @IsOptional()
  @IsInt()
  @Min(0)
  creditDays?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
