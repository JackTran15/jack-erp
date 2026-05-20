import { ApiProperty } from '@nestjs/swagger';
import { InvoiceEntity } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { LocationEntity } from '../../inventory/location/location.entity';

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
}
