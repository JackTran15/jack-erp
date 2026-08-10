import { ApiProperty } from '@nestjs/swagger';
import { PromotionProgramType } from '@erp/shared-interfaces';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { CustomerEntity } from '../../customer/customer.entity';

/**
 * One promotion program that actually ran at checkout, read back from the
 * `invoice_checkout_promotions` audit snapshot (T-08-01). Only `type` +
 * `discountAmount` — enough for the print breakdown (UOW-08) to bucket by
 * invoice-level vs item-level discount; per-line/gift detail already lives
 * on `items[]` and isn't duplicated here.
 */
export class AppliedInvoicePromotionDto {
  @ApiProperty({ enum: PromotionProgramType })
  type: PromotionProgramType;

  @ApiProperty({ type: Number })
  discountAmount: number;
}

/** Invoice line item enriched with its resolved storage location. */
export class DraftInvoiceItemDto extends InvoiceItemEntity {
  @ApiProperty({
    type: () => LocationEntity,
    nullable: true,
    description: 'Resolved storage location for this line (null if locationId is unset or stale).',
  })
  location: LocationEntity | null;
}

/** Draft invoice payload returned to the POS client, including its line items snapshot. */
export class DraftInvoiceResponseDto extends InvoiceEntity {
  @ApiProperty({ type: [DraftInvoiceItemDto], description: 'Line items belonging to this draft, ordered by sortOrder.' })
  items: DraftInvoiceItemDto[];

  @ApiProperty({
    type: () => CustomerEntity,
    nullable: true,
    description: 'Resolved customer for the invoice (null when no customer is attached).',
  })
  customer: CustomerEntity | null;

  @ApiProperty({
    type: [InvoicePaymentEntity],
    description: 'Per-method payment breakdown (cash / bank transfer / card) for the full receipt.',
  })
  payments: InvoicePaymentEntity[];

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Outstanding debt (invoice_debts.remainingAmount) for this invoice; null when there is no debt.',
  })
  remainingDebt: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Display name of the staff member (cashier) who created the invoice; null when the user no longer exists.',
  })
  staffName: string | null;

  @ApiProperty({
    type: [AppliedInvoicePromotionDto],
    description: 'Promotion programmes that actually ran at checkout, read back from the invoice_checkout_promotions snapshot.',
  })
  appliedPromotions: AppliedInvoicePromotionDto[];
}
