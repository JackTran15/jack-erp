import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  SessionStatus,
  DocumentType,
  JournalSource,
  StockMovementType,
  DomainEventType,
  WsEventType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../../events/event-publisher.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockLedgerService } from '../../inventory/ledger/stock-ledger.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { PosSessionEntity, SaleEntity, SaleLineEntity, PaymentEntity } from '../entities';
import { CheckoutDto } from '../dto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectRepository(PosSessionEntity)
    private readonly sessionRepo: Repository<PosSessionEntity>,
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    private readonly dataSource: DataSource,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly journalService: JournalService,
    private readonly eventPublisher: EventPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  async checkout(
    dto: CheckoutDto,
    actor: ActorContext,
  ): Promise<SaleEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: dto.sessionId, organizationId: actor.organizationId },
    });

    if (!session) {
      throw new BadRequestException(`POS session ${dto.sessionId} not found`);
    }

    if (
      session.status !== SessionStatus.OPEN &&
      session.status !== SessionStatus.ACTIVE_SALES
    ) {
      throw new BadRequestException(
        `Session ${dto.sessionId} is ${session.status}, cannot checkout`,
      );
    }

    await this.validateStockAvailability(dto, actor);

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.SALE,
      session.branchId,
      actor,
    );

    const now = new Date();
    const subtotal = dto.lines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice,
      0,
    );
    const taxAmount = dto.lines.reduce((sum, l) => sum + l.taxAmount, 0);
    const totalAmount = subtotal + taxAmount;

    const paymentTotal = dto.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentTotal - totalAmount) > 0.01) {
      throw new BadRequestException(
        `Payment total (${paymentTotal}) does not match sale total (${totalAmount})`,
      );
    }

    const sale = await this.dataSource.transaction(async (manager) => {
      const saleEntity = manager.create(SaleEntity, {
        organizationId: actor.organizationId,
        branchId: session.branchId,
        createdBy: actor.userId,
        documentNumber,
        sessionId: session.id,
        customerId: dto.customerId,
        subtotal,
        taxAmount,
        totalAmount,
        saleDate: now,
      });
      const savedSale = await manager.save(saleEntity);

      const lineEntities = dto.lines.map((line) =>
        manager.create(SaleLineEntity, {
          organizationId: actor.organizationId,
          branchId: session.branchId,
          createdBy: actor.userId,
          saleId: savedSale.id,
          itemId: line.itemId,
          locationId: line.locationId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.quantity * line.unitPrice,
          taxAmount: line.taxAmount,
        }),
      );
      savedSale.lines = await manager.save(lineEntities);

      const paymentEntities = dto.payments.map((p) =>
        manager.create(PaymentEntity, {
          organizationId: actor.organizationId,
          branchId: session.branchId,
          createdBy: actor.userId,
          saleId: savedSale.id,
          method: p.method,
          amount: p.amount,
          reference: p.reference,
        }),
      );
      savedSale.payments = await manager.save(paymentEntities);

      return savedSale;
    });

    for (const line of dto.lines) {
      await this.stockLedgerService.recordMovement({
        itemId: line.itemId,
        locationId: line.locationId,
        branchId: session.branchId!,
        organizationId: actor.organizationId,
        movementType: StockMovementType.SALE_ISSUE,
        quantity: -line.quantity,
        referenceType: 'SALE',
        referenceId: sale.id,
        actorContext: actor,
      });
    }

    await this.journalService.post(
      {
        source: JournalSource.SALE,
        sourceReferenceId: sale.id,
        description: `POS Sale ${documentNumber}`,
        lines: [
          {
            accountId: dto.cashAccountId,
            debitAmount: totalAmount,
            creditAmount: 0,
            lineOrder: 1,
          },
          {
            accountId: dto.revenueAccountId,
            debitAmount: 0,
            creditAmount: totalAmount,
            lineOrder: 2,
          },
        ],
      },
      actor,
    );

    await this.eventPublisher.publish(
      ERP_TOPICS.SALE_POSTED,
      {
        eventId: uuid(),
        eventType: DomainEventType.SALE_POSTED,
        timestamp: now.toISOString(),
        organizationId: actor.organizationId,
        branchId: session.branchId,
        correlationId: sale.id,
        payload: {
          saleId: sale.id,
          documentNumber,
          sessionId: session.id,
          totalAmount,
          actorId: actor.userId,
        },
      },
      sale.id,
    );

    this.wsEmitter.emitToBranch(session.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_CHECKOUT_ACKNOWLEDGED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: session.branchId,
      correlationId: sale.id,
      payload: {
        saleId: sale.id,
        documentNumber,
        totalAmount,
      },
    });

    this.logger.log(
      `Checkout completed: ${documentNumber} (sale=${sale.id}, session=${session.id})`,
    );

    return sale;
  }

  async findSaleOrFail(
    saleId: string,
    actor: ActorContext,
  ): Promise<SaleEntity> {
    const sale = await this.saleRepo.findOne({
      where: { id: saleId, organizationId: actor.organizationId },
      relations: ['lines', 'payments'],
    });
    if (!sale) {
      throw new BadRequestException(`Sale ${saleId} not found`);
    }
    return sale;
  }

  private async validateStockAvailability(
    dto: CheckoutDto,
    actor: ActorContext,
  ): Promise<void> {
    for (const line of dto.lines) {
      const balance = await this.stockLedgerService.getBalance(
        line.itemId,
        line.locationId,
        actor.organizationId,
      );
      const available = balance ? Number(balance.quantity) : 0;
      if (available < line.quantity) {
        throw new BadRequestException(
          `Insufficient stock for item ${line.itemId} at location ${line.locationId}: ` +
            `available=${available}, requested=${line.quantity}`,
        );
      }
    }
  }
}
