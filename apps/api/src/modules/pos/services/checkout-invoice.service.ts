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

    if (remainder > 0) {
      if (!invoice.customerId) {
        throw new BadRequestException(
          'Invoice must have a customer when there is a remaining debt balance',
        );
      }
      if (!dto.receivableAccountId) {
        throw new BadRequestException(
          'receivableAccountId is required when total payments are less than the amount due',
        );
      }
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
          const paymentEntities = dto.payments.map((p) =>
            manager.create(InvoicePaymentEntity, {
              organizationId: actor.organizationId,
              branchId: actor.branchId,
              createdBy: actor.userId,
              invoiceId: saved.id,
              paymentMethod: p.paymentMethod,
              amount: p.amount,
              accountId: p.accountId,
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
        revenueAccountId: dto.revenueAccountId,
        receivableAccountId: dto.receivableAccountId,
        payments: dto.payments.map((p) => ({
          accountId: p.accountId,
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
      const activeSession = await this.sessionRepo.findOne({
        where: {
          organizationId: actor.organizationId,
          openedBy: actor.userId,
          status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
        },
      });

      for (const cp of cashPayments) {
        await this.cashFromPaymentPublisher.publish(
          {
            invoiceId: updatedInvoice.id,
            invoicePaymentId: cp.id,
            invoiceCode: realCode,
            sessionId: activeSession?.id,
            cashAccountId: activeSession?.cashAccountId ?? cp.accountId,
            contraAccountId: dto.revenueAccountId,
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
