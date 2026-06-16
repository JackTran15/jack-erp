import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  IsDateString,
  IsInt,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoicePaymentMethod } from '../entities/invoice.entity';

export class InvoicePaymentLineDto {
  @IsEnum(InvoicePaymentMethod)
  paymentMethod: InvoicePaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount: number;

  /**
   * The configured `payment_accounts` row this payment goes into — e.g. which bank
   * account a transfer landed in. The server validates the mapping belongs to the
   * actor's org + branch and matches `paymentMethod`, then derives the receiving COA
   * account; clients never send a COA account id directly.
   *
   * Optional: when omitted the server falls back to the single account configured
   * for the method, and rejects the request if more than one exists.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CheckoutInvoiceDto {
  /** Payment lines. Empty array = full debt (requires a customer on the invoice). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentLineDto)
  payments: InvoicePaymentLineDto[];

  /**
   * Credit due date (ISO `YYYY-MM-DD`). Stored on the debt record when the sale
   * leaves a remaining balance (DEBT / PARTIAL_DEBT). Ignored when fully paid.
   */
  @ApiPropertyOptional({ example: '2026-06-25' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Credit term in days entered at checkout (per invoice). */
  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditDays?: number;
}
