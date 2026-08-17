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

  /**
   * Change the customer declined to take back ("Khách không lấy tiền thừa").
   *
   * `payments` still carry only what settles the invoice — the surplus never
   * inflates `totalPaid` or revenue. It is booked separately as other income
   * (Phiếu thu, DR quỹ / CR 711), so the drawer matches the cash physically in
   * it. Only valid on a fully-settled cash sale. Mirrors
   * `CheckoutInvoiceDto.keptChangeAmount` (v1).
   */
  @ApiPropertyOptional({ example: 60000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  keptChangeAmount?: number;

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
   * Dual meaning (ADR-03 in 03-logical-design.md, deliberately one field, not
   * two). The server always recomputes the discount itself (ADR-06) — this
   * list only selects *which* programs run:
   * 1. Turns on an `auto_apply=false` program — without this, it never runs.
   * 2. Makes a listed program win a contested resource ahead of `priority`
   *    (PromotionResolver.resolve) — including one that's `auto_apply=true`
   *    and currently winning. Ids for programs not eligible/not contesting
   *    anything are simply ignored.
   */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedProgramIds?: string[];

  /**
   * ADR-07 (pos-promotion-apply/03-logical-design.md) — ids to keep out of
   * the race entirely, filtered out before `selectedProgramIds` is even
   * consulted. The inverse of `selectedProgramIds`: always exclude, never
   * add. Wins on conflict if an id is in both.
   */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludedProgramIds?: string[];

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
