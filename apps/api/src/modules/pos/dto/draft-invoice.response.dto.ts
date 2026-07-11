import { ApiProperty } from '@nestjs/swagger';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { CustomerEntity } from '../../customer/customer.entity';

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
}
