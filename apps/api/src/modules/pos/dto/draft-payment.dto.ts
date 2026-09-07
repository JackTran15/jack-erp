import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoicePaymentMethod } from '../entities/invoice.entity';

/**
 * One payment line as the cashier had it when they parked the cart. Stored whole
 * into `invoices.draft_payments` so reopening the draft restores what was typed.
 *
 * Deliberately not an `invoice_payments` row: that table is the money that was
 * actually taken and requires a resolved GL account, which a draft does not have.
 */
export class DraftPaymentDto {
  @ApiProperty({ enum: InvoicePaymentMethod })
  @IsEnum(InvoicePaymentMethod)
  method: InvoicePaymentMethod;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentAccountId?: string;
}
