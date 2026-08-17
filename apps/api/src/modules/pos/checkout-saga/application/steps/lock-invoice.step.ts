import { ConflictException, Injectable } from '@nestjs/common';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { InvoiceEntity, InvoiceStatus } from '../../../entities/invoice.entity';

/**
 * Re-reads and locks the invoice inside the transaction, re-asserting it is
 * still a checkoutable draft.
 *
 * Closes bug (f): `load-draft` (preflight) reads the invoice with no lock and
 * outside any transaction; nothing re-guards it before checkout writes. Two
 * concurrent requests on the same invoice both pass that read and both
 * write. This step is the re-guard — `SELECT ... FOR UPDATE`, then the exact
 * same check `load-draft` already did.
 */
@Injectable()
export class LockInvoiceStep implements CheckoutStep {
  readonly name = 'lock-invoice';
  readonly phase = 'transactional' as const;

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = await manager
      .createQueryBuilder(InvoiceEntity, 'invoice')
      .setLock('pessimistic_write')
      .where('invoice.id = :id', { id: ctx.input.invoiceId })
      .andWhere('invoice.organizationId = :orgId', {
        orgId: ctx.actor.organizationId,
      })
      .getOne();

    if (!invoice || !invoice.isDraft || invoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictException({
        code: 'INVOICE_NOT_CHECKOUTABLE',
        message: `Invoice ${ctx.input.invoiceId} was checked out by another request`,
      });
    }

    ctx.invoice = invoice;
  }
}
