import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  DocumentType,
  JournalSource,
  StockMovementType,
  DomainEventType,
  WsEventType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockLedgerService } from '../../inventory/ledger/stock-ledger.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { InvoiceDebtEntity } from '../entities/invoice-debt.entity';
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
    private readonly dataSource: DataSource,
    private readonly invoiceDebtService: InvoiceDebtService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly journalService: JournalService,
    private readonly eventPublisher: EventPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
    private readonly promotionApplyService: PromotionApplyService,
  ) {}

  async checkout(
    id: string,
    dto: CheckoutInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    // ── 1. Load & validate invoice ──────────────────────────────────────────
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

    // ── 2. Load items ────────────────────────────────────────────────────────
    const items = await this.itemRepo.find({
      where: { invoiceId: id },
      order: { sortOrder: 'ASC' },
    });

    if (items.length === 0) {
      throw new BadRequestException(`Invoice ${id} has no items`);
    }

    // ── 3. Filter items that have a location (for stock movement recording) ──
    const itemsWithLocation = items.filter((i) => i.locationId);

    // ── 4. Recalculate totals ─────────────────────────────────────────────────
    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
    const discountAmount = Number(invoice.discountAmount ?? 0);
    const depositAmount = Number(invoice.depositAmount ?? 0);
    const amountDue = subtotal - discountAmount - depositAmount;

    // ── 5. Payment math ───────────────────────────────────────────────────────
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

    // ── 6. Determine new status ───────────────────────────────────────────────
    const newStatus =
      remainder <= 0
        ? InvoiceStatus.PAID
        : totalPaid > 0
        ? InvoiceStatus.PARTIAL_DEBT
        : InvoiceStatus.DEBT;

    // ── 7. Generate real invoice code ─────────────────────────────────────────
    const draftCode = invoice.code;
    const realCode = await this.documentNumberingService.generate(
      DocumentType.INVOICE,
      invoice.branchId,
      actor,
    );

    const now = new Date();

    // ── 8. Commit invoice + payments + debt in one DB transaction ─────────────
    const updatedInvoice = await this.dataSource.transaction(async (manager) => {
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
        await manager.save(paymentEntities);
      }

      if (remainder > 0) {
        await this.invoiceDebtService.createFromInvoice(saved, remainder, manager);
      }

      await this.promotionApplyService.commitPromotions(saved, manager);

      return saved;
    });

    // ── 9. Stock movements — compensate on failure ────────────────────────────
    try {
      const movements = itemsWithLocation.map((item) => ({
        itemId: item.itemId,
        locationId: item.locationId!,
        branchId: invoice.branchId!,
        organizationId: actor.organizationId,
        movementType: StockMovementType.SALE_ISSUE,
        quantity: -Number(item.quantity),
        referenceType: 'INVOICE',
        referenceId: updatedInvoice.id,
        actorContext: actor,
      }));

      if (movements.length > 0) {
        await this.stockLedgerService.recordBatchMovements(movements);
      }
    } catch (stockErr) {
      this.logger.error(
        `Stock deduction failed for invoice ${id} — reverting to draft. Error: ${stockErr}`,
      );

      await this.dataSource.transaction(async (manager) => {
        await manager.update(InvoiceEntity, { id }, {
          isDraft: true,
          status: InvoiceStatus.DRAFT,
          code: draftCode,
          issuedAt: null as any,
          totalPaid: 0,
        });
        await manager.delete(InvoicePaymentEntity, { invoiceId: id });
        await manager.delete(InvoiceDebtEntity, { invoiceId: id });
      });

      throw new InternalServerErrorException(
        'Stock deduction failed. Invoice has been reverted to draft.',
      );
    }

    // ── 10. Accounting journal (non-critical) ──────────────────────────────────
    try {
      const journalActor = { ...actor, branchId: updatedInvoice.branchId };
      let lineOrder = 1;
      const journalLines: { accountId: string; debitAmount: number; creditAmount: number; lineOrder: number }[] = [];

      for (const p of dto.payments) {
        journalLines.push({
          accountId: p.accountId,
          debitAmount: p.amount,
          creditAmount: 0,
          lineOrder: lineOrder++,
        });
      }

      if (remainder > 0) {
        journalLines.push({
          accountId: dto.receivableAccountId!,
          debitAmount: remainder,
          creditAmount: 0,
          lineOrder: lineOrder++,
        });
      }

      journalLines.push({
        accountId: dto.revenueAccountId,
        debitAmount: 0,
        creditAmount: amountDue,
        lineOrder: lineOrder,
      });

      await this.journalService.post(
        {
          source: JournalSource.SALE,
          sourceReferenceId: updatedInvoice.id,
          description: `POS Invoice ${realCode}`,
          lines: journalLines,
        },
        journalActor,
      );
    } catch (journalErr) {
      this.logger.error(
        `CRITICAL: Journal posting failed for invoice ${id} (code=${realCode}). Manual reconciliation required. Error: ${journalErr}`,
      );
    }

    // ── 11. Kafka event ────────────────────────────────────────────────────────
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

    // ── 12. WebSocket notification ─────────────────────────────────────────────
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
