import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * Body of `POST /invoices/:id/checkout-return/preview` — the cashier's
 * programme selection for the "Mua thêm" lines, nothing else. No
 * refundMethod, no payments: the dry-run answers "what will this draft settle
 * to?", which is what the POS needs BEFORE it can build those.
 */
export class CheckoutReturnPreviewDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedProgramIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludedProgramIds?: string[];
}

/**
 * `CheckoutReturnService.ComputedTotals`, verbatim — the same object
 * `checkout()` settles the document on, produced by the same code path
 * (2026092102 ADR-03). The POS builds the `checkout-return` body from
 * `netAmount`/`refundedAmount`; the rest is for display and for the trail.
 */
export class CheckoutReturnPreviewResponseDto {
  /** Gross value of the returned (IN) lines. */
  @ApiProperty({ type: Number })
  returnSubtotal: number;

  /** Gross value of the "Mua thêm" (OUT) lines — what `invoice.subtotal` will carry. */
  @ApiProperty({ type: Number })
  newSubtotal: number;

  /** What the promotion engine takes off the OUT lines. */
  @ApiProperty({ type: Number })
  newPromotionDiscount: number;

  /** `newSubtotal − newPromotionDiscount`. */
  @ApiProperty({ type: Number })
  newNet: number;

  /** What the customer actually paid for the returned lines (net of the original's discounts). */
  @ApiProperty({ type: Number })
  returnedNet: number;

  /** `newNet − returnedNet`: > 0 the customer pays, 0 even swap, < 0 the store refunds. */
  @ApiProperty({ type: Number })
  netAmount: number;

  /** `max(returnedNet − newNet, 0)`. */
  @ApiProperty({ type: Number })
  refundedAmount: number;
}
