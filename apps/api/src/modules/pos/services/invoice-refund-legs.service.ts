import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../accounting/payment-accounts/enums';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { InvoiceEntity, InvoicePaymentMethod } from '../entities/invoice.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { InvoiceCancelledRefundLeg } from '../publishers/invoice-cancelled.publisher';

/**
 * Turns what a customer actually paid on a document into the refund legs that
 * pay it back when the document is voided. Shared by both cancel paths: a sale
 * refunds its takings, and so does an exchange that collected a top-up.
 */
@Injectable()
export class InvoiceRefundLegsService {
  constructor(
    @InjectRepository(InvoicePaymentEntity)
    private readonly paymentRepo: Repository<InvoicePaymentEntity>,
    private readonly accountResolver: AccountResolverService,
    private readonly cashFundResolver: CashFundResolverService,
  ) {}

  /**
   * Group what the customer actually paid into one refund leg per destination
   * fund. The amount is the money collected (`invoice_payments`), never
   * `amountDue` — voiding a partially paid invoice refunds only what was handed
   * over; the unpaid remainder is settled as debt instead.
   *
   * Returns an empty array when nothing was collected, which is the normal case
   * for a pure debt invoice and for a return, and must not block the cancel.
   */
  async build(
    invoice: InvoiceEntity,
    actor: ActorContext,
  ): Promise<InvoiceCancelledRefundLeg[]> {
    const payments = await this.paymentRepo.find({
      where: { invoiceId: invoice.id, organizationId: actor.organizationId },
    });
    if (payments.length === 0) {
      return [];
    }

    const contraAccountId = await this.accountResolver.resolveDefaultAccount(
      AccountingDefaultAccountRole.REVENUE,
      actor,
    );

    const cashPayments = payments.filter(
      (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
    );
    const nonCashPayments = payments.filter(
      (p) => p.paymentMethod !== InvoicePaymentMethod.CASH,
    );

    const legs: InvoiceCancelledRefundLeg[] = [];

    if (cashPayments.length > 0) {
      // One cash fund per branch. `payment.accountId` is a COA id, not a
      // cash_accounts id — using it here is the bug CashFundResolverService
      // exists to prevent.
      const cashAccountId = await this.cashFundResolver.resolveBranchCashFund(
        actor.organizationId,
        invoice.branchId,
      );
      legs.push({
        invoicePaymentIds: cashPayments.map((p) => p.id),
        fundKind: 'CASH',
        cashAccountId,
        amount: sumAmount(cashPayments),
        contraAccountId,
      });
    }

    // Non-cash lines are grouped by the fund they landed in: the explicit
    // deposit fund when the payment_accounts mapping named one, otherwise the
    // COA the line resolved to (same fallback the deposit consumer uses).
    const byDepositAccount = new Map<string, InvoicePaymentEntity[]>();
    for (const payment of nonCashPayments) {
      const key = payment.depositAccountId ?? payment.accountId;
      const group = byDepositAccount.get(key);
      if (group) {
        group.push(payment);
      } else {
        byDepositAccount.set(key, [payment]);
      }
    }

    for (const [depositAccountId, group] of byDepositAccount) {
      legs.push({
        invoicePaymentIds: group.map((p) => p.id),
        fundKind: 'DEPOSIT',
        depositAccountId,
        amount: sumAmount(group),
        contraAccountId,
      });
    }

    return legs;
  }
}

/** Numeric columns come back as strings — sum them as numbers. */
function sumAmount(payments: InvoicePaymentEntity[]): number {
  return payments.reduce((total, payment) => total + Number(payment.amount), 0);
}
