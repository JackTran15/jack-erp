import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  DocumentType,
  DomainEventType,
  SessionStatus,
  WsEventType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { StockDeductionPublisher } from '../../inventory/publishers/stock-deduction.publisher';
import { TempWarehouseFulfillPublisher } from '../../inventory/publishers/temp-warehouse-fulfill.publisher';
import { LoyaltyPointsPublisher } from '../../customer/publishers/loyalty-points.publisher';
import { JournalSalePublisher } from '../../accounting/publishers/journal-sale.publisher';
import { CashFromPaymentPublisher } from '../../accounting/publishers/cash-from-payment.publisher';
import { DepositFromPaymentPublisher } from '../../accounting/deposit/deposit-from-payment.publisher';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import {
  AccountingDefaultAccountRole,
  PaymentAccountMethod,
} from '../../accounting/payment-accounts/enums';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceStatus,
} from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { PosSessionEntity } from '../entities/pos-session.entity';
import { CheckoutInvoiceDto } from '../dto/checkout-invoice.dto';
import { InvoiceDebtService } from './invoice-debt.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import { computeAmountDue } from './invoice-amount.util';
import { MetricsService } from '../../metrics/metrics.service';
import { POINT_EARN_VND_PER_POINT } from '../../customer/loyalty.constants';

/** POS payment method → payment-account config method. Values are identical
 * strings; this map keeps the two enums decoupled at the type level. */
const PAYMENT_METHOD_TO_ACCOUNT_METHOD: Record<
  InvoicePaymentMethod,
  PaymentAccountMethod
> = {
  [InvoicePaymentMethod.CASH]: PaymentAccountMethod.CASH,
  [InvoicePaymentMethod.BANK_TRANSFER]: PaymentAccountMethod.BANK_TRANSFER,
  [InvoicePaymentMethod.CARD]: PaymentAccountMethod.CARD,
};

@Injectable()
export class CheckoutInvoiceService {
  private readonly logger = new Logger(CheckoutInvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(PosSessionEntity)
    private readonly sessionRepo: Repository<PosSessionEntity>,
    private readonly dataSource: DataSource,
    private readonly invoiceDebtService: InvoiceDebtService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly eventPublisher: EventPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
    private readonly promotionApplyService: PromotionApplyService,
    private readonly stockDeductionPublisher: StockDeductionPublisher,
    private readonly tempWarehouseFulfillPublisher: TempWarehouseFulfillPublisher,
    private readonly loyaltyPointsPublisher: LoyaltyPointsPublisher,
    private readonly journalSalePublisher: JournalSalePublisher,
    private readonly cashFromPaymentPublisher: CashFromPaymentPublisher,
    private readonly depositFromPaymentPublisher: DepositFromPaymentPublisher,
    private readonly accountResolver: AccountResolverService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly membershipCardService: MembershipCardService,
    private readonly metrics: MetricsService,
  ) {}

  async checkout(
    id: string,
    dto: CheckoutInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const start = Date.now();
    try {
      const result = await this.runCheckout(id, dto, actor);
      this.metrics.observeCheckout('success', (Date.now() - start) / 1000);
      return result;
    } catch (err) {
      this.metrics.observeCheckout('error', (Date.now() - start) / 1000);
      throw err;
    }
  }

  private async runCheckout(
    id: string,
    dto: CheckoutInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    if (!invoice) {
      throw new BadRequestException(`Invoice ${id} not found`);
    }

    if (!invoice.isDraft || invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Invoice ${id} is not a draft and cannot be checked out`,
      );
    }

    const items = await this.itemRepo.find({
      where: { invoiceId: id },
      order: { sortOrder: 'ASC' },
    });

    if (items.length === 0) {
      throw new BadRequestException(`Invoice ${id} has no items`);
    }

    const itemsMissingLocation = items.filter((i) => !i.locationId);
    if (itemsMissingLocation.length > 0) {
      throw new BadRequestException(
        `Invoice ${id} has items without an assigned location: ${itemsMissingLocation
          .map((i) => i.itemId)
          .join(', ')}. Configure product → location mapping before checkout.`,
      );
    }

    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
    const discountAmount = Number(invoice.discountAmount ?? 0);
    const pointsDiscountAmount = Number(invoice.pointsDiscountAmount ?? 0);
    const depositAmount = Number(invoice.depositAmount ?? 0);
    const amountDue = computeAmountDue({
      subtotal,
      discountAmount,
      pointsDiscountAmount,
      depositAmount,
    });

    const round = (v: number) => Math.round(v * 100) / 100;
    const totalPaid = round(dto.payments.reduce((sum, p) => sum + p.amount, 0));
    const remainder = round(amountDue - totalPaid);

    // Loyalty earn is based on the amount actually payable after all discounts
    // (subtotal − discountAmount − pointsDiscountAmount − depositAmount), so a
    // point-redemption discount reduces what is earned. Persisted for display and
    // passed as the async award base so the awarded balance matches this value.
    const pointsEarned = Math.floor(amountDue / POINT_EARN_VND_PER_POINT);

    if (totalPaid > amountDue) {
      throw new BadRequestException(
        `Total payments (${totalPaid}) exceed the amount due (${amountDue})`,
      );
    }

    if (remainder > 0 && !invoice.customerId) {
      throw new BadRequestException(
        'Invoice must have a customer when there is a remaining debt balance',
      );
    }

    // Posting accounts are resolved server-side from configuration; any account
    // IDs the client put on the DTO are ignored.
    const revenueAccountId = await this.accountResolver.resolveDefaultAccount(
      AccountingDefaultAccountRole.REVENUE,
      actor,
    );
    const receivableAccountId =
      remainder > 0
        ? await this.accountResolver.resolveDefaultAccount(
            AccountingDefaultAccountRole.RECEIVABLE,
            actor,
          )
        : undefined;

    // Resolve the receiving COA account (and, when configured, the exact deposit
    // fund) per payment line. The client picks a configured payment_accounts row
    // (paymentAccountId) — e.g. which bank a transfer went into; the resolver
    // validates it against the actor's branch + method. Results are index-aligned
    // with dto.payments and cached by the chosen account (or method, for the
    // unspecified default) to avoid duplicate lookups.
    const resolvedAccountByKey = new Map<
      string,
      { accountId: string; depositAccountId?: string }
    >();
    const resolvedAccountIds: string[] = [];
    const resolvedDepositAccountIds: Array<string | undefined> = [];
    for (const p of dto.payments) {
      const cacheKey = p.paymentAccountId ?? `default:${p.paymentMethod}`;
      let resolved = resolvedAccountByKey.get(cacheKey);
      if (!resolved) {
        resolved = await this.accountResolver.resolvePaymentAccount(
          PAYMENT_METHOD_TO_ACCOUNT_METHOD[p.paymentMethod],
          actor,
          p.paymentAccountId,
        );
        resolvedAccountByKey.set(cacheKey, resolved);
      }
      resolvedAccountIds.push(resolved.accountId);
      resolvedDepositAccountIds.push(resolved.depositAccountId);
    }

    const newStatus =
      remainder <= 0
        ? InvoiceStatus.PAID
        : totalPaid > 0
        ? InvoiceStatus.PARTIAL_DEBT
        : InvoiceStatus.DEBT;

    const realCode = await this.documentNumberingService.generate(
      DocumentType.INVOICE,
      invoice.branchId,
      actor,
    );

    const now = new Date();

    const { invoice: updatedInvoice, payments: savedPayments } =
      await this.dataSource.transaction(async (manager) => {
        invoice.isDraft = false;
        invoice.status = newStatus;
        invoice.issuedAt = now;
        invoice.code = realCode;
        invoice.subtotal = subtotal;
        invoice.discountAmount = discountAmount;
        invoice.depositAmount = depositAmount;
        invoice.amountDue = amountDue;
        invoice.totalPaid = totalPaid;
        invoice.pointsEarned = pointsEarned;

        const saved = await manager.save(invoice);

        let savedPayments: InvoicePaymentEntity[] = [];
        if (dto.payments.length > 0) {
          const paymentEntities = dto.payments.map((p, idx) =>
            manager.create(InvoicePaymentEntity, {
              organizationId: actor.organizationId,
              branchId: actor.branchId,
              createdBy: actor.userId,
              invoiceId: saved.id,
              paymentMethod: p.paymentMethod,
              amount: p.amount,
              accountId: resolvedAccountIds[idx],
              depositAccountId: resolvedDepositAccountIds[idx],
              reference: p.reference,
            }),
          );
          savedPayments = await manager.save(paymentEntities);
        }

        if (remainder > 0) {
          await this.invoiceDebtService.createFromInvoice(saved, remainder, manager, {
            dueDate: dto.dueDate,
            creditDays: dto.creditDays,
          });
        }

        // Redeem loyalty points synchronously: locks the card, re-checks the
        // balance and deducts within this transaction. Throwing here rolls back
        // the whole checkout, so the discount can never be granted without the
        // points being taken.
        if (saved.pointsRedeemed > 0 && saved.customerId) {
          await this.membershipCardService.redeemPointsForInvoice(
            {
              customerId: saved.customerId,
              points: saved.pointsRedeemed,
              invoiceId: saved.id,
            },
            manager,
            actor,
          );
        }

        await this.promotionApplyService.commitPromotions(saved, manager);

        return { invoice: saved, payments: savedPayments };
      });

    // Publish downstream events — consumers process async with DLQ + dead_letter_events
    await this.stockDeductionPublisher.publish(
      updatedInvoice.id,
      items.map((item) => ({
        itemId: item.itemId,
        locationId: item.locationId!,
        quantity: Number(item.quantity),
      })),
      updatedInvoice.branchId!,
      actor,
    );

    // Auto-transfer any sold item that is staged in the temp warehouse
    // (warehouse -> showroom) against this invoice. The consumer no-ops when the
    // branch has no ACTIVE session or no staged line, so this is always published.
    const fulfillByItem = new Map<string, number>();
    for (const item of items) {
      fulfillByItem.set(
        item.itemId,
        (fulfillByItem.get(item.itemId) ?? 0) + Number(item.quantity),
      );
    }
    await this.tempWarehouseFulfillPublisher.publish({
      organizationId: actor.organizationId,
      branchId: updatedInvoice.branchId!,
      invoiceId: updatedInvoice.id,
      invoiceNumber: realCode,
      actor: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        roles: actor.roles,
      },
      lines: [...fulfillByItem.entries()].map(([itemId, quantity]) => ({
        itemId,
        quantity,
      })),
    });

    await this.loyaltyPointsPublisher.publish(
      {
        invoiceId: updatedInvoice.id,
        customerId: updatedInvoice.customerId,
        // Earn base = amountDue (net of all discounts, incl. point redemption).
        subtotal: amountDue,
        issuedAt: updatedInvoice.issuedAt,
        branchId: updatedInvoice.branchId,
      },
      actor,
    );

    await this.journalSalePublisher.publish(
      {
        invoiceId: updatedInvoice.id,
        code: realCode,
        branchId: updatedInvoice.branchId,
        amountDue,
        remainder,
        revenueAccountId,
        receivableAccountId,
        payments: dto.payments.map((p, idx) => ({
          accountId: resolvedAccountIds[idx],
          amount: p.amount,
        })),
      },
      actor,
    );

    // Publish cash movement events for CASH payments — consumer creates cash_movements
    // and updates cash_accounts.balance on the session's drawer.
    const cashPayments = savedPayments.filter(
      (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
    );
    if (cashPayments.length > 0) {
      // One cash fund per branch: cash always lands in the branch's fund (mapped
      // to COA 1111). Never use cp.accountId here — that is a COA account id, not
      // a cash_accounts id.
      const branchCashFundId = await this.cashFundResolver.resolveBranchCashFund(
        actor.organizationId,
        updatedInvoice.branchId,
      );

      for (const cp of cashPayments) {
        await this.cashFromPaymentPublisher.publish(
          {
            invoiceId: updatedInvoice.id,
            invoicePaymentId: cp.id,
            invoiceCode: realCode,
            sessionId: undefined,
            cashAccountId: branchCashFundId,
            contraAccountId: revenueAccountId,
            amount: Number(cp.amount),
            branchId: updatedInvoice.branchId,
          },
          actor,
        );
      }
    }

    // Publish deposit movement events for NON-CASH payments (bank transfer / card / e-wallet).
    // The consumer derives the deposit fund from each line's resolved COA (FR-02); lines whose
    // COA maps to no deposit fund are ignored. Idempotent per (invoice, payment line).
    const nonCashPayments = savedPayments.filter(
      (p) => p.paymentMethod !== InvoicePaymentMethod.CASH,
    );
    for (const ncp of nonCashPayments) {
      await this.depositFromPaymentPublisher.publish(
        {
          invoiceId: updatedInvoice.id,
          invoicePaymentId: ncp.id,
          invoiceCode: realCode,
          paymentMethod: ncp.paymentMethod,
          resolvedAccountId: ncp.accountId,
          depositAccountId: ncp.depositAccountId,
          contraAccountId: revenueAccountId,
          amount: Number(ncp.amount),
          docDate: now.toISOString().slice(0, 10),
          branchId: updatedInvoice.branchId,
        },
        actor,
      );
    }

    await this.eventPublisher.publish(
      ERP_TOPICS.SALE_POSTED,
      {
        eventId: uuid(),
        eventType: DomainEventType.SALE_POSTED,
        timestamp: now.toISOString(),
        organizationId: actor.organizationId,
        branchId: invoice.branchId,
        correlationId: updatedInvoice.id,
        payload: {
          invoiceId: updatedInvoice.id,
          documentNumber: realCode,
          totalAmount: amountDue,
          actorId: actor.userId,
        },
      },
      updatedInvoice.id,
    );

    this.wsEmitter.emitToBranch(invoice.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_CHECKOUT_ACKNOWLEDGED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: updatedInvoice.id,
      payload: {
        invoiceId: updatedInvoice.id,
        documentNumber: realCode,
        totalAmount: amountDue,
      },
    });

    this.logger.log(
      `Checked out invoice ${id} → code=${realCode}, status=${newStatus}, totalPaid=${totalPaid}, remainder=${remainder} (org=${actor.organizationId})`,
    );

    return updatedInvoice;
  }
}
