import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  DocumentType,
  SessionStatus,
  WsEventType,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { CashFromPaymentPublisher } from '../../accounting/publishers/cash-from-payment.publisher';
import { CashRefundPublisher } from '../../accounting/publishers/cash-refund.publisher';
import { JournalReturnPublisher } from '../../accounting/publishers/journal-return.publisher';
import { LoyaltyPointsPublisher } from '../../customer/publishers/loyalty-points.publisher';
import { LoyaltyPointsReversePublisher } from '../../customer/publishers/loyalty-points-reverse.publisher';
import { StockDeductionPublisher } from '../../inventory/publishers/stock-deduction.publisher';
import { CustomerCreditService } from '../../customer/services/customer-credit.service';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
  RefundMethod,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import {
  InvoiceDebtEntity,
  DebtStatus,
} from '../entities/invoice-debt.entity';
import { PosSessionEntity } from '../entities/pos-session.entity';
import { CheckoutReturnDto } from '../dto/checkout-return.dto';
import { ReturnPostedPublisher } from '../publishers/return-posted.publisher';
import { StockReturnInPublisher } from '../publishers/stock-return-in.publisher';

interface ComputedTotals {
  returnSubtotal: number;
  newSubtotal: number;
  netAmount: number;
  refundedAmount: number;
}

const RETURN_INVOICE_TYPES = new Set<InvoiceType>([
  InvoiceType.RETURN,
  InvoiceType.EXCHANGE,
]);

@Injectable()
export class CheckoutReturnService {
  private readonly logger = new Logger(CheckoutReturnService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(PosSessionEntity)
    private readonly sessionRepo: Repository<PosSessionEntity>,
    private readonly dataSource: DataSource,
    private readonly numbering: DocumentNumberingService,
    private readonly wsEmitter: WebSocketEmitterService,
    private readonly customerCredit: CustomerCreditService,
    private readonly returnPostedPublisher: ReturnPostedPublisher,
    private readonly stockReturnInPublisher: StockReturnInPublisher,
    private readonly stockDeductionPublisher: StockDeductionPublisher,
    private readonly cashRefundPublisher: CashRefundPublisher,
    private readonly cashFromPaymentPublisher: CashFromPaymentPublisher,
    private readonly journalReturnPublisher: JournalReturnPublisher,
    private readonly loyaltyPointsPublisher: LoyaltyPointsPublisher,
    private readonly loyaltyPointsReversePublisher: LoyaltyPointsReversePublisher,
  ) {}

  async checkout(
    id: string,
    dto: CheckoutReturnDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    if (!invoice.isDraft || invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Invoice ${id} is not a draft and cannot be checked out`,
      );
    }
    if (!RETURN_INVOICE_TYPES.has(invoice.type)) {
      throw new BadRequestException(
        `Invoice ${id} is type ${invoice.type}, only RETURN/EXCHANGE accepted here`,
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
          .join(', ')}`,
      );
    }

    const totals = this.computeTotals(items);
    this.validateRefundMatrix(invoice, dto, totals);

    const realCode = await this.numbering.generate(
      DocumentType.RETURN,
      invoice.branchId,
      actor,
    );

    const activeSession = await this.findActiveSession(actor);
    const resolvedCashAccountId = activeSession?.cashAccountId ?? dto.cashAccountId;

    // Validate that we have the cash account when needed.
    if (
      (dto.refundMethod === RefundMethod.CASH && totals.refundedAmount > 0) ||
      (totals.netAmount > 0 && this.hasCashPayments(dto))
    ) {
      if (!resolvedCashAccountId) {
        throw new BadRequestException(
          'cashAccountId is required (no active drawer session and no explicit account supplied)',
        );
      }
    }

    const now = new Date();
    let originalInvoice: InvoiceEntity | null = null;
    if (invoice.originalInvoiceId) {
      originalInvoice = await this.invoiceRepo.findOne({
        where: {
          id: invoice.originalInvoiceId,
          organizationId: actor.organizationId,
        },
      });
    }

    const posted = await this.dataSource.transaction(async (manager) => {
      invoice.isDraft = false;
      invoice.status = InvoiceStatus.PAID;
      invoice.issuedAt = now;
      invoice.code = realCode;
      invoice.subtotal = totals.newSubtotal || totals.returnSubtotal;
      invoice.amountDue = Math.max(totals.netAmount, 0);
      invoice.totalPaid = totals.netAmount > 0 ? totals.netAmount : 0;
      invoice.refundMethod = dto.refundMethod;
      invoice.refundedAmount = totals.refundedAmount;
      invoice.netAmount = totals.netAmount;
      if (dto.note) invoice.note = dto.note;
      const savedInvoice = await manager.save(invoice);

      // Atomic returned_quantity guard on each original SALE line referenced.
      const inLines = items.filter((it) => it.direction === ItemDirection.IN);
      for (const line of inLines) {
        if (!line.originalInvoiceItemId) continue; // QUICK return — skip
        const qty = Number(line.quantity);
        const result = await manager.query(
          `UPDATE invoice_items
              SET returned_quantity = returned_quantity + $1
            WHERE id = $2
              AND returned_quantity + $1 <= quantity`,
          [qty, line.originalInvoiceItemId],
        );
        const rowCount = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
        if (rowCount !== 1) {
          throw new ConflictException(
            `Vượt số lượng có thể trả cho line ${line.originalInvoiceItemId}`,
          );
        }
      }

      // Save InvoicePayment rows when EXCHANGE net > 0.
      let savedPayments: InvoicePaymentEntity[] = [];
      if (totals.netAmount > 0 && dto.payments && dto.payments.length > 0) {
        const paymentEntities = dto.payments.map((p) =>
          manager.create(InvoicePaymentEntity, {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            createdBy: actor.userId,
            invoiceId: savedInvoice.id,
            paymentMethod: p.paymentMethod,
            amount: p.amount,
            accountId: p.accountId,
            reference: p.reference,
          }),
        );
        savedPayments = await manager.save(paymentEntities);
      }

      // STORE_CREDIT issuance.
      if (
        dto.refundMethod === RefundMethod.STORE_CREDIT &&
        totals.refundedAmount > 0
      ) {
        await this.customerCredit.issue(
          savedInvoice,
          totals.refundedAmount,
          manager,
        );
      }

      // OFFSET against original DEBT invoice.
      if (
        dto.refundMethod === RefundMethod.OFFSET &&
        totals.refundedAmount > 0 &&
        originalInvoice &&
        (originalInvoice.status === InvoiceStatus.DEBT ||
          originalInvoice.status === InvoiceStatus.PARTIAL_DEBT)
      ) {
        await this.offsetOriginalDebt(
          manager,
          originalInvoice,
          totals.refundedAmount,
          now,
        );
      }

      return { invoice: savedInvoice, payments: savedPayments };
    });

    // Fan-out events (after commit).
    await this.fanOutEvents(
      posted.invoice,
      posted.payments,
      items,
      totals,
      dto,
      activeSession,
      resolvedCashAccountId,
      actor,
    );

    this.wsEmitter.emitToBranch(invoice.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_CHECKOUT_ACKNOWLEDGED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: posted.invoice.id,
      payload: {
        invoiceId: posted.invoice.id,
        documentNumber: realCode,
        type: invoice.type,
        refundedAmount: totals.refundedAmount,
        netAmount: totals.netAmount,
      },
    });

    this.logger.log(
      `Checked out ${invoice.type} invoice ${id} code=${realCode} method=${dto.refundMethod} refunded=${totals.refundedAmount} net=${totals.netAmount}`,
    );

    return posted.invoice;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private computeTotals(items: InvoiceItemEntity[]): ComputedTotals {
    let returnSubtotal = 0;
    let newSubtotal = 0;
    for (const it of items) {
      const total = Number(it.lineTotal);
      if (it.direction === ItemDirection.IN) returnSubtotal += total;
      else newSubtotal += total;
    }
    const round = (v: number) => Math.round(v * 100) / 100;
    returnSubtotal = round(returnSubtotal);
    newSubtotal = round(newSubtotal);
    const netAmount = round(newSubtotal - returnSubtotal);
    const refundedAmount = round(Math.max(returnSubtotal - newSubtotal, 0));
    return { returnSubtotal, newSubtotal, netAmount, refundedAmount };
  }

  private validateRefundMatrix(
    invoice: InvoiceEntity,
    dto: CheckoutReturnDto,
    totals: ComputedTotals,
  ): void {
    const { netAmount, refundedAmount } = totals;

    if (netAmount > 0) {
      // EXCHANGE net > 0 — payments required, refundMethod typically OFFSET (auto pay-through).
      const paid = Number(
        (dto.payments ?? []).reduce((s, p) => s + Number(p.amount), 0).toFixed(2),
      );
      if (paid !== netAmount) {
        throw new BadRequestException(
          `Tổng payments (${paid}) phải khớp netAmount (${netAmount})`,
        );
      }
      if (refundedAmount !== 0) {
        // Shouldn't happen given math, but guard.
        throw new BadRequestException(
          'Internal inconsistency: net > 0 implies refundedAmount = 0',
        );
      }
    } else if (netAmount < 0) {
      // RETURN or EXCHANGE refund.
      if (
        dto.refundMethod !== RefundMethod.CASH &&
        dto.refundMethod !== RefundMethod.STORE_CREDIT &&
        dto.refundMethod !== RefundMethod.OFFSET
      ) {
        throw new BadRequestException(
          `refundMethod ${dto.refundMethod} không hợp lệ khi netAmount<0`,
        );
      }
      if (dto.refundMethod === RefundMethod.STORE_CREDIT && !invoice.customerId) {
        throw new BadRequestException(
          'STORE_CREDIT yêu cầu invoice có customerId',
        );
      }
      if (dto.refundMethod === RefundMethod.STORE_CREDIT && !dto.creditLiabilityAccountId) {
        throw new BadRequestException(
          'STORE_CREDIT yêu cầu creditLiabilityAccountId',
        );
      }
      if (dto.refundMethod === RefundMethod.OFFSET && !dto.receivableAccountId) {
        throw new BadRequestException(
          'OFFSET yêu cầu receivableAccountId (để bù vào công nợ gốc)',
        );
      }
      if (dto.payments && dto.payments.length > 0) {
        throw new BadRequestException(
          'payments không được cung cấp khi netAmount <= 0',
        );
      }
    } else {
      // netAmount === 0 — pure EXCHANGE swap.
      if (dto.refundMethod !== RefundMethod.OFFSET) {
        throw new BadRequestException(
          'netAmount = 0 → refundMethod phải là OFFSET',
        );
      }
      if (dto.payments && dto.payments.length > 0) {
        throw new BadRequestException(
          'payments không được cung cấp khi netAmount = 0',
        );
      }
    }
  }

  private hasCashPayments(dto: CheckoutReturnDto): boolean {
    return !!dto.payments?.some(
      (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
    );
  }

  private async findActiveSession(
    actor: ActorContext,
  ): Promise<PosSessionEntity | null> {
    return this.sessionRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        openedBy: actor.userId,
        status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
      },
    });
  }

  private async offsetOriginalDebt(
    manager: EntityManager,
    originalInvoice: InvoiceEntity,
    refundedAmount: number,
    now: Date,
  ): Promise<void> {
    const debt = await manager.findOne(InvoiceDebtEntity, {
      where: {
        invoiceId: originalInvoice.id,
        organizationId: originalInvoice.organizationId,
      },
    });
    if (!debt) {
      this.logger.warn(
        `OFFSET: no debt record found for invoice ${originalInvoice.id} — skipping settlement`,
      );
      return;
    }
    if (debt.status === DebtStatus.PAID) {
      this.logger.warn(
        `OFFSET: debt ${debt.id} already PAID — skipping`,
      );
      return;
    }
    const applied = Math.min(refundedAmount, Number(debt.remainingAmount));
    debt.paidAmount = Number((Number(debt.paidAmount) + applied).toFixed(2));
    debt.remainingAmount = Number(
      (Number(debt.originalAmount) - debt.paidAmount).toFixed(2),
    );
    if (debt.remainingAmount <= 0) {
      debt.remainingAmount = 0;
      debt.status = DebtStatus.PAID;
      debt.settledAt = now;
    }
    await manager.save(debt);
  }

  private async fanOutEvents(
    invoice: InvoiceEntity,
    payments: InvoicePaymentEntity[],
    items: InvoiceItemEntity[],
    totals: ComputedTotals,
    dto: CheckoutReturnDto,
    activeSession: PosSessionEntity | null,
    resolvedCashAccountId: string | undefined,
    actor: ActorContext,
  ): Promise<void> {
    const branchId = invoice.branchId!;
    const inLines = items.filter((it) => it.direction === ItemDirection.IN);
    const outLines = items.filter((it) => it.direction === ItemDirection.OUT);

    // 1. STOCK_RETURN_IN — always for IN lines.
    if (inLines.length > 0) {
      await this.stockReturnInPublisher.publish(
        invoice.id,
        invoice.code,
        branchId,
        inLines.map((it) => ({
          itemId: it.itemId,
          locationId: it.locationId!,
          quantity: Number(it.quantity),
        })),
        actor,
      );
    }

    // 2. STOCK_DEDUCTION — EXCHANGE OUT lines.
    if (outLines.length > 0) {
      await this.stockDeductionPublisher.publish(
        invoice.id,
        outLines.map((it) => ({
          itemId: it.itemId,
          locationId: it.locationId!,
          quantity: Number(it.quantity),
        })),
        branchId,
        actor,
      );
    }

    // 3. JOURNAL_POST_RETURN — always.
    await this.journalReturnPublisher.publish(
      {
        returnInvoiceId: invoice.id,
        returnInvoiceCode: invoice.code,
        source: invoice.type === InvoiceType.EXCHANGE ? 'EXCHANGE' : 'RETURN',
        refundMethod: dto.refundMethod,
        refundedAmount: totals.refundedAmount,
        netAmount: totals.netAmount,
        revenueAccountId: dto.revenueAccountId,
        cashAccountId: resolvedCashAccountId,
        receivableAccountId: dto.receivableAccountId,
        creditLiabilityAccountId: dto.creditLiabilityAccountId,
        branchId,
      },
      actor,
    );

    // 4. CASH_REFUND — only refundMethod=CASH AND refundedAmount > 0.
    if (
      dto.refundMethod === RefundMethod.CASH &&
      totals.refundedAmount > 0 &&
      resolvedCashAccountId
    ) {
      await this.cashRefundPublisher.publish(
        {
          returnInvoiceId: invoice.id,
          returnInvoiceCode: invoice.code,
          cashAccountId: resolvedCashAccountId,
          contraAccountId: dto.revenueAccountId,
          amount: totals.refundedAmount,
          sessionId: activeSession?.id,
          branchId,
        },
        actor,
      );
    }

    // 5. CASH_MOVEMENT_FROM_PAYMENT — EXCHANGE net > 0 with cash payments.
    if (totals.netAmount > 0) {
      const cashPayments = payments.filter(
        (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
      );
      for (const cp of cashPayments) {
        await this.cashFromPaymentPublisher.publish(
          {
            invoiceId: invoice.id,
            invoicePaymentId: cp.id,
            invoiceCode: invoice.code,
            sessionId: activeSession?.id,
            cashAccountId: activeSession?.cashAccountId ?? cp.accountId,
            contraAccountId: dto.revenueAccountId,
            amount: Number(cp.amount),
            branchId,
          },
          actor,
        );
      }
    }

    // 6. Loyalty — REVERSE when net <= 0, AWARD when net > 0.
    if (invoice.customerId) {
      if (totals.netAmount > 0) {
        await this.loyaltyPointsPublisher.publish(
          {
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            subtotal: totals.netAmount,
            issuedAt: invoice.issuedAt,
            branchId,
          },
          actor,
        );
      } else {
        const delta = Math.abs(totals.refundedAmount || totals.returnSubtotal);
        if (delta > 0) {
          await this.loyaltyPointsReversePublisher.publish(
            {
              returnInvoiceId: invoice.id,
              customerId: invoice.customerId,
              subtotalDelta: delta,
              branchId,
            },
            actor,
          );
        }
      }
    }

    // 7. RETURN_POSTED — always.
    await this.returnPostedPublisher.publish(
      {
        returnInvoiceId: invoice.id,
        returnInvoiceCode: invoice.code,
        type: invoice.type === InvoiceType.EXCHANGE ? 'EXCHANGE' : 'RETURN',
        customerId: invoice.customerId,
        branchId,
      },
      actor,
    );
  }
}
