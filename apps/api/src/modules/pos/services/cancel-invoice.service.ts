import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  StockMovementType,
  DomainEventType,
  WsEventType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerService } from '../../inventory/ledger/stock-ledger.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoiceDebtEntity, DebtStatus } from '../entities/invoice-debt.entity';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';

@Injectable()
export class CancelInvoiceService {
  private readonly logger = new Logger(CancelInvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoiceDebtEntity)
    private readonly debtRepo: Repository<InvoiceDebtEntity>,
    private readonly dataSource: DataSource,
    private readonly stockLedgerService: StockLedgerService,
    private readonly journalService: JournalService,
    private readonly promotionApplyService: PromotionApplyService,
    private readonly eventPublisher: EventPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  async cancel(
    id: string,
    dto: CancelInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    // 1. Load & validate
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    if (
      invoice.status !== InvoiceStatus.PAID &&
      invoice.status !== InvoiceStatus.DEBT
    ) {
      throw new BadRequestException(
        `Only paid or debt invoices can be cancelled. Current status: ${invoice.status}`,
      );
    }

    // 2. Load items for stock reversal
    const items = await this.itemRepo.find({ where: { invoiceId: id } });
    const wasDebt = invoice.status === InvoiceStatus.DEBT;

    // 3. DB transaction: mark invoice cancelled + close debt if applicable
    const now = new Date();

    const cancelledInvoice = await this.dataSource.transaction(async (manager) => {
      invoice.status = InvoiceStatus.CANCELLED;
      invoice.cancelledAt = now;
      invoice.cancelReason = dto.reason;
      const saved = await manager.save(invoice);

      if (wasDebt) {
        // close the outstanding debt record
        await manager.update(
          InvoiceDebtEntity,
          { invoiceId: id, organizationId: actor.organizationId },
          { status: DebtStatus.PAID, settledAt: now },
        );
      }

      // revert promotions within the same transaction
      await this.promotionApplyService.revertPromotions(id, manager);

      return saved;
    });

    // 4. Stock return — RETURN_IN movements (positive qty)
    const itemsWithLocation = items.filter((i) => i.locationId);
    if (itemsWithLocation.length > 0) {
      try {
        const movements = itemsWithLocation.map((item) => ({
          itemId: item.itemId,
          locationId: item.locationId!,
          branchId: invoice.branchId!,
          organizationId: actor.organizationId,
          movementType: StockMovementType.RETURN_IN,
          quantity: Number(item.quantity),
          referenceType: 'INVOICE_CANCEL',
          referenceId: id,
          actorContext: actor,
        }));

        await this.stockLedgerService.recordBatchMovements(movements);
      } catch (stockErr) {
        this.logger.error(
          `CRITICAL: Stock return failed for cancelled invoice ${id}. Manual stock correction required. Error: ${stockErr}`,
        );
      }
    }

    // 5. Reverse journal entry
    try {
      const journalEntry = await this.journalService.findBySourceRef(
        id,
        actor.organizationId,
      );
      if (journalEntry) {
        const journalActor = { ...actor, branchId: invoice.branchId };
        await this.journalService.reverse(journalEntry.id, dto.reason, journalActor);
      } else {
        this.logger.warn(
          `No posted journal entry found for invoice ${id} — skipping journal reversal`,
        );
      }
    } catch (journalErr) {
      this.logger.error(
        `CRITICAL: Journal reversal failed for cancelled invoice ${id}. Manual reconciliation required. Error: ${journalErr}`,
      );
    }

    // 6. Kafka event
    await this.eventPublisher.publish(
      ERP_TOPICS.INVOICE_CANCELLED,
      {
        eventId: uuid(),
        eventType: DomainEventType.INVOICE_CANCELLED,
        timestamp: now.toISOString(),
        organizationId: actor.organizationId,
        branchId: invoice.branchId,
        correlationId: id,
        payload: {
          invoiceId: id,
          documentNumber: invoice.code,
          reason: dto.reason,
          actorId: actor.userId,
        },
      },
      id,
    );

    // 7. WebSocket notification
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
      `Cancelled invoice ${id} (code=${invoice.code}, org=${actor.organizationId})`,
    );

    return cancelledInvoice;
  }
}
