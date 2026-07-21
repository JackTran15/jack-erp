import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';
import { DepositRefundService } from './deposit-refund.service';

/**
 * Deposit-fund side of a cancelled POS invoice (FR-11). Complements
 * `JournalReverseConsumer` (which reverses the sale/revenue journal entry) —
 * this reverses the SEPARATE deposit-movement journal entry, if any (a cash
 * invoice has no deposit movement, so this is a harmless no-op for it).
 */
@Injectable()
export class DepositRefundConsumer {
  private readonly logger = new Logger(DepositRefundConsumer.name);

  constructor(private readonly refund: DepositRefundService) {}

  @OnDomainEvent(ERP_TOPICS.INVOICE_CANCELLED, {
    groupId: 'erp-api.invoice.cancelled.deposit-refund',
  })
  async handle(event: DomainEvent<InvoiceCancelledPayload>): Promise<void> {
    const { invoiceId, branchId, organizationId, actorId } = event.payload;
    if (!branchId) return;

    // BR-REF-02: the invoice is already cancelled by the time this event
    // arrives (cancellation isn't gated on this async side-effect) — a
    // reconciled movement can't be auto-reversed, and it's a business-rule
    // block, not a transient failure, so it's logged (not sent to the DLQ for
    // pointless retry) with the same guidance the ticket's 409 message gives.
    try {
      const result = await this.refund.reverseForCancelledInvoice(invoiceId, {
        userId: actorId,
        organizationId,
        branchId,
        roles: [],
      });
      if (result.reversedCount > 0) {
        this.logger.log(
          `Reversed ${result.reversedCount} deposit movement(s) for cancelled invoice ${invoiceId}`,
        );
      }
    } catch (err) {
      // Only the reconciled-block (BR-REF-02) is a permanent, non-retryable
      // business rule. A locked-period block (BR-LOCK-01) is transient (the
      // period may later unlock) and must still reach the DLQ, so it is
      // deliberately re-thrown, not caught here.
      if (err instanceof ConflictException && err.message.includes('BR-REF-02')) {
        this.logger.warn(
          `Invoice ${invoiceId} cancelled but its deposit movement is already reconciled — create a customer-refund payment manually: ${err.message}`,
        );
        return;
      }
      throw err;
    }
  }
}
