import { Injectable } from '@nestjs/common';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { InvoicePaymentEntity } from '../../../entities/invoice-payment.entity';

/**
 * Writes one `invoice_payments` row per payment line, index-aligned with
 * `resolve-accounts`' output. `accountId` / `depositAccountId` always come
 * from the server-side resolution done in preflight — never from anything
 * the client sent directly. Parity target: checkout-invoice.service.ts:267-283.
 */
@Injectable()
export class PersistPaymentsStep implements CheckoutStep {
  readonly name = 'persist-payments';
  readonly phase = 'transactional' as const;

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const accounts = ctx.accounts;
    if (!invoice || !accounts) {
      throw new Error(
        'persist-payments ran before its prerequisite steps populated the context',
      );
    }

    if (ctx.input.payments.length === 0) {
      ctx.savedPayments = [];
      return;
    }

    const paymentRepo = manager.getRepository(InvoicePaymentEntity);
    const entities = ctx.input.payments.map((payment, idx) =>
      paymentRepo.create({
        organizationId: ctx.actor.organizationId,
        branchId: ctx.actor.branchId,
        createdBy: ctx.actor.userId,
        invoiceId: invoice.id,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        accountId: accounts.perPayment[idx].accountId,
        depositAccountId: accounts.perPayment[idx].depositAccountId,
        reference: payment.reference,
      }),
    );

    ctx.savedPayments = await paymentRepo.save(entities);
  }
}
