import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { JournalService } from '../journal/journal.service';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';

@Injectable()
export class JournalReverseConsumer {
  private readonly logger = new Logger(JournalReverseConsumer.name);

  constructor(private readonly journalService: JournalService) {}

  @OnDomainEvent(ERP_TOPICS.INVOICE_CANCELLED, { groupId: 'erp-api.invoice.cancelled.journal-reverse' })
  async handle(event: DomainEvent<InvoiceCancelledPayload>): Promise<void> {
    const { invoiceId, reason, branchId, organizationId, actorId } = event.payload;

    const journalEntry = await this.journalService.findBySourceRef(invoiceId, organizationId);
    if (!journalEntry) {
      this.logger.log(
        `No POSTED journal entry found for invoice ${invoiceId} — already reversed or never posted, skipping`,
      );
      return;
    }

    await this.journalService.reverse(journalEntry.id, reason, {
      userId: actorId,
      organizationId,
      branchId,
      roles: [],
    });

    this.logger.log(
      `Reversed journal entry ${journalEntry.documentNumber} for cancelled invoice ${invoiceId}`,
    );
  }
}
