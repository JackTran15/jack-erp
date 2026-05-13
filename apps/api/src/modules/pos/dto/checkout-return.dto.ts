import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
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

  /** Payments — only required for EXCHANGE with netAmount > 0. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentLineDto)
  payments?: InvoicePaymentLineDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
