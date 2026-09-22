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
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RefundMethod } from '../entities/invoice.entity';
import { InvoicePaymentLineDto } from './checkout-invoice.dto';

export class CheckoutReturnDto {
  /**
   * Which fund pays out the refund. It does NOT decide whether the original
   * invoice's outstanding debt is settled — that happens on every return, ahead
   * of any payout, and is reported back as `offsetAmount`.
   *
   * `OFFSET` is accepted as a legacy alias of `CASH` so older POS builds keep
   * working; the resulting document is identical either way.
   */
  @IsEnum(RefundMethod)
  refundMethod: RefundMethod;

  /** Deprecated — revenue (the refund/journal contra) is resolved server-side from
   * the org's default REVENUE account. Kept optional for backward compatibility;
   * any value sent by the client is ignored. */
  @IsOptional()
  @IsUUID()
  revenueAccountId?: string;

  /** Required when refundMethod = CASH AND no active drawer session is found. */
  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  /**
   * Required when refundMethod = BANK: the operator's chosen receiving fund
   * (payment_accounts.id). The server resolves its linked deposit_account_id and
   * uses revenueAccountId as the contra — clients never send a COA id directly.
   */
  @IsOptional()
  @IsUUID()
  refundAccountId?: string;

  /** Deprecated — the AR account for a debt settlement is resolved server-side.
   * Kept optional so an older client sending it is not rejected. */
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

  /**
   * Promotion programmes the cashier ticked for the "Mua thêm" (OUT) lines —
   * same meaning as `CheckoutV2Dto.selectedProgramIds` (pos-promotion-apply
   * ADR-03): an `auto_apply=false` programme only runs when listed here, and a
   * listed programme wins a contested resource ahead of priority. The server
   * evaluates the OUT lines itself (2026092102 ADR-01); no amount is accepted
   * from the client.
   */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedProgramIds?: string[];

  /** Programmes the cashier un-ticked — kept out of the race entirely (ADR-07). */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludedProgramIds?: string[];
}
