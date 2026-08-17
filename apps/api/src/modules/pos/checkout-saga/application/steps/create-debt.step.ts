import { Injectable } from '@nestjs/common';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { InvoiceDebtService } from '../../../services/invoice-debt.service';

/**
 * Creates the `invoice_debts` row when the sale leaves a remaining balance.
 * Reuses `InvoiceDebtService.createFromInvoice` — the same service and the
 * same validation (`dueDate` cannot be before the issue date) as v1. Parity
 * target: checkout-invoice.service.ts:285-290.
 */
@Injectable()
export class CreateDebtStep implements CheckoutStep {
  readonly name = 'create-debt';
  readonly phase = 'transactional' as const;

  constructor(private readonly invoiceDebtService: InvoiceDebtService) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const totals = ctx.totals;
    if (!invoice || !totals) {
      throw new Error(
        'create-debt ran before its prerequisite steps populated the context',
      );
    }

    if (totals.remainder <= 0) return;

    await this.invoiceDebtService.createFromInvoice(
      invoice,
      totals.remainder,
      manager,
      { dueDate: ctx.input.dueDate, creditDays: ctx.input.creditDays },
    );
  }
}
