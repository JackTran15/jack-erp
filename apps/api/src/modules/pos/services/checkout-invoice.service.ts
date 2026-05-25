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
import { LoyaltyPointsPublisher } from '../../customer/publishers/loyalty-points.publisher';
import { JournalSalePublisher } from '../../accounting/publishers/journal-sale.publisher';
import { CashFromPaymentPublisher } from '../../accounting/publishers/cash-from-payment.publisher';
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
    private readonly loyaltyPointsPublisher: LoyaltyPointsPublisher,
    private readonly journalSalePublisher: JournalSalePublisher,
    private readonly cashFromPaymentPublisher: CashFromPaymentPublisher,
    private readonly accountResolver: AccountResolverService,
    private readonly cashFundResolver: CashFundResolverService,
  ) {}

  async checkout(
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
    const depositAmount = Number(invoice.depositAmount ?? 0);
    const amountDue = subtotal - discountAmount - depositAmount;

    const round = (v: number) => Math.round(v * 100) / 100;
    const totalPaid = round(dto.payments.reduce((sum, p) => sum + p.amount, 0));
    const remainder = round(amountDue - totalPaid);

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

    // Resolve the receiving COA account per payment line. The client picks a
    // configured payment_accounts row (paymentAccountId) — e.g. which bank a
    // transfer went into; the resolver validates it against the actor's branch +
    // method. Results are index-aligned with dto.payments and cached by the chosen
    // account (or method, for the unspecified default) to avoid duplicate lookups.
    const resolvedAccountByKey = new Map<string, string>();
    const resolvedAccountIds: string[] = [];
    for (const p of dto.payments) {
      const cacheKey = p.paymentAccountId ?? `default:${p.paymentMethod}`;
      let accountId = resolvedAccountByKey.get(cacheKey);
      if (!accountId) {
        accountId = await this.accountResolver.resolvePaymentAccount(
          PAYMENT_METHOD_TO_ACCOUNT_METHOD[p.paymentMethod],
          actor,
          p.paymentAccountId,
        );
        resolvedAccountByKey.set(cacheKey, accountId);
      }
      resolvedAccountIds.push(accountId);
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
              reference: p.reference,
            }),
          );
          savedPayments = await manager.save(paymentEntities);
        }

        if (remainder > 0) {
          await this.invoiceDebtService.createFromInvoice(saved, remainder, manager);
        }

        await this.promotionApplyService.commitPromotions(saved, manager);

        return { invoice: saved, payments: savedPayments };
      });

    // Publish 3 downstream events — consumers process async with DLQ + dead_letter_events
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

    await this.loyaltyPointsPublisher.publish(
      {
        invoiceId: updatedInvoice.id,
        customerId: updatedInvoice.customerId,
        subtotal,
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
