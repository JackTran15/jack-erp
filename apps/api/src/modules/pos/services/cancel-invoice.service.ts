import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { WsEventType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../accounting/payment-accounts/enums';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { LoyaltyPointsReversePublisher } from '../../customer/publishers/loyalty-points-reverse.publisher';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { InvoiceDebtEntity, DebtStatus } from '../entities/invoice-debt.entity';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';
import {
  InvoiceCancelledPublisher,
  InvoiceCancelledRefundLeg,
} from '../publishers/invoice-cancelled.publisher';

const CANCELLABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.PAID,
  InvoiceStatus.DEBT,
  InvoiceStatus.PARTIAL_DEBT,
]);

@Injectable()
export class CancelInvoiceService {
  private readonly logger = new Logger(CancelInvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoicePaymentEntity)
    private readonly paymentRepo: Repository<InvoicePaymentEntity>,
    private readonly dataSource: DataSource,
    private readonly promotionApplyService: PromotionApplyService,
    private readonly invoiceCancelledPublisher: InvoiceCancelledPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
    private readonly accountResolver: AccountResolverService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly loyaltyPointsReversePublisher: LoyaltyPointsReversePublisher,
  ) {}

  async cancel(
    id: string,
    dto: CancelInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    if (!CANCELLABLE_STATUSES.has(invoice.status)) {
      throw new BadRequestException(
        `Only paid/debt/partial-debt invoices can be cancelled. Current status: ${invoice.status}`,
      );
    }

    // A RETURN/EXCHANGE already moves money the other way; cancelling one would
    // issue a refund voucher against a document that is itself a refund.
    if (invoice.type !== InvoiceType.SALE) {
      throw new BadRequestException(
        `Only sale invoices can be cancelled. Current type: ${invoice.type}`,
      );
    }

    await this.assertNoSettledReturns(invoice, actor);

    const items = await this.itemRepo.find({ where: { invoiceId: id } });
    // Resolved before the transaction on purpose: a branch with no cash fund is
    // a configuration error, and failing here leaves the invoice untouched
    // rather than emitting an event no consumer can honour.
    const refunds = await this.buildRefundLegs(invoice, actor);
    const hasOutstandingDebt =
      invoice.status === InvoiceStatus.DEBT ||
      invoice.status === InvoiceStatus.PARTIAL_DEBT;
    const now = new Date();

    const cancelledInvoice = await this.dataSource.transaction(async (manager) => {
      invoice.status = InvoiceStatus.CANCELLED;
      invoice.cancelledAt = now;
      invoice.cancelReason = dto.reason;
      // Cancelling voids the sale outright, so every point it earned is clawed
      // back — same snapshot convention as a full return (see checkout-return.service).
      invoice.pointsReversed = invoice.pointsEarned;
      const saved = await manager.save(invoice);

      if (hasOutstandingDebt) {
        await manager.update(
          InvoiceDebtEntity,
          { invoiceId: id, organizationId: actor.organizationId },
          { status: DebtStatus.PAID, settledAt: now },
        );
      }

      await this.promotionApplyService.revertPromotions(id, manager);

      return saved;
    });

    await this.invoiceCancelledPublisher.publish(
      {
        invoiceId: id,
        documentNumber: invoice.code,
        reason: dto.reason,
        branchId: invoice.branchId,
        items: items
          .filter((i) => i.locationId)
          .map((item) => ({
            itemId: item.itemId,
            locationId: item.locationId!,
            quantity: Number(item.quantity),
          })),
        refunds,
      },
      actor,
    );

    if (invoice.customerId) {
      await this.loyaltyPointsReversePublisher.publish(
        {
          returnInvoiceId: id,
          customerId: invoice.customerId,
          subtotalDelta: Number(invoice.amountDue),
          branchId: invoice.branchId,
        },
        actor,
      );
    }

    this.wsEmitter.emitToBranch(invoice.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_INVOICE_CANCELLED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: id,
      payload: {
        invoiceId: id,
        documentNumber: invoice.code,
        reason: dto.reason,
      },
    });

    this.logger.log(
      `Cancelled invoice ${id} (code=${invoice.code}, org=${actor.organizationId}, ` +
        `refundLegs=${refunds.length}, refundTotal=${refunds.reduce(
          (sum, leg) => sum + leg.amount,
          0,
        )})`,
    );

    return cancelledInvoice;
  }

  /**
   * Refuse an invoice that has already been partly refunded through the
   * return/exchange flow: that money went back once already, and cancelling
   * would pay it a second time. Drafts and cancelled returns do not count —
   * neither moved anything.
   */
  private async assertNoSettledReturns(
    invoice: InvoiceEntity,
    actor: ActorContext,
  ): Promise<void> {
    const settledReturns = await this.invoiceRepo.count({
      where: {
        organizationId: actor.organizationId,
        originalInvoiceId: invoice.id,
        isDraft: false,
        status: Not(InvoiceStatus.CANCELLED),
      },
    });

    if (settledReturns > 0) {
      throw new BadRequestException(
        `Invoice ${invoice.code} already has a return/exchange and cannot be cancelled. ` +
          'Use the return flow instead.',
      );
    }
  }

  /**
   * Group what the customer actually paid into one refund leg per destination
   * fund. The amount is the money collected (`invoice_payments`), never
   * `amountDue` — cancelling a partially paid invoice refunds only what was
   * handed over; the unpaid remainder is settled as debt instead.
   *
   * Returns an empty array when nothing was collected, which is the normal case
   * for a pure debt invoice and must not block the cancellation.
   */
  private async buildRefundLegs(
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
