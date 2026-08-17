import { Injectable } from '@nestjs/common';
import { DocumentType } from '@erp/shared-interfaces';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { mintDocumentNumber } from './mint-document-number';

/**
 * Mints the real invoice number inside the checkout transaction.
 *
 * ADR-02: `DocumentNumberingService.generate` opens its own `SERIALIZABLE`
 * transaction and does not accept a `manager`, so a number it mints cannot
 * roll back with the rest of checkout. `mintDocumentNumber` (T-03-02) is the
 * composable subset — resolve the active rule, lock and increment the
 * counter — against `ctx.manager`, so a rollback here really does give the
 * number back.
 *
 * Deliberately does NOT call `DocumentNumberingService` or
 * `ensureDefaultActiveRule` — preflight (`resolve-funds`, via the public
 * `preview()`) already guaranteed a rule exists (A-07). Do not "clean this
 * up" into a call to the service; that reintroduces the exact bug this step
 * exists to close.
 */
@Injectable()
export class NextDocumentNumberStep implements CheckoutStep {
  readonly name = 'next-document-number';
  readonly phase = 'transactional' as const;

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    if (!invoice) {
      throw new Error(
        'next-document-number ran before load-draft populated the context',
      );
    }

    ctx.documentNumber = await mintDocumentNumber(
      manager,
      DocumentType.INVOICE,
      invoice.branchId,
      ctx.actor,
    );
  }
}
