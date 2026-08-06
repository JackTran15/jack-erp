import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoicePaymentMethod } from '../../../entities/invoice.entity';
import { CheckoutInput, CheckoutPaymentInput } from '../../application/checkout-step';

export class CheckoutV2PaymentLineDto implements CheckoutPaymentInput {
  @ApiProperty({ enum: InvoicePaymentMethod })
  @IsEnum(InvoicePaymentMethod)
  paymentMethod: InvoicePaymentMethod;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  /**
   * A configured `payment_accounts` row — e.g. which bank a transfer went
   * into. The server validates and derives the receiving COA account; clients
   * never send a COA account id directly.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;
}

/**
 * Request body for `POST /v2/pos/checkout`. Every field the saga will ever
 * read is declared from this ticket onward — including fields not used until
 * UOW-04/UOW-05 — so the contract (and generated OpenAPI) stays stable as
 * later units of work land.
 */
export class CheckoutV2Dto implements CheckoutInput {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  invoiceId: string;

  /** Payment lines. Empty array = full debt (requires a customer on the invoice). */
  @ApiProperty({ type: [CheckoutV2PaymentLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutV2PaymentLineDto)
  payments: CheckoutV2PaymentLineDto[];

  /** Credit due date (ISO `YYYY-MM-DD`). Stored on the debt record when the sale leaves a remaining balance. */
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

  /**
   * Ids of `auto_apply=false` programs the cashier picked manually. The
   * server always recomputes the discount itself (ADR-06 in
   * 03-logical-design.md) — this list only selects *which* programs run.
   * Not consumed until T-04-03.
   */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedProgramIds?: string[];

  /** Voucher code to redeem against this checkout. Not consumed until T-05-01. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voucherCode?: string;

  /**
   * Run every preflight step and report the result without writing anything.
   * Only `true` is supported until UOW-02 lands the transactional phase.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
