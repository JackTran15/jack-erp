import {
  Injectable,
  Logger,
  BadRequestException,
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
import { EventPublisher } from '../../events/event-publisher.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockLedgerService } from '../../inventory/ledger/stock-ledger.service';
import { JournalService } from '../../accounting/journal/journal.service';
import {
  SaleEntity,
  SaleStatus,
  SaleLineEntity,
  PaymentEntity,
  ReturnEntity,
  ReturnLineEntity,
} from '../entities';
import { ProcessExchangeDto } from '../dto';

export interface ExchangeResult {
  returnDoc: ReturnEntity;
  newSale: SaleEntity;
}

@Injectable()
export class ExchangeService {
  private readonly logger = new Logger(ExchangeService.name);

  constructor(
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    private readonly dataSource: DataSource,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly journalService: JournalService,
    private readonly eventPublisher: EventPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  async processExchange(
    saleId: string,
    dto: ProcessExchangeDto,
    actor: ActorContext,
  ): Promise<ExchangeResult> {
    const sale = await this.saleRepo.findOne({
      where: { id: saleId, organizationId: actor.organizationId },
      relations: ['lines'],
    });

    if (!sale) {
      throw new BadRequestException(`Sale ${saleId} not found`);
    }

    if (
      sale.status !== SaleStatus.COMPLETED &&
      sale.status !== SaleStatus.PARTIALLY_RETURNED
    ) {
      throw new BadRequestException(
        `Sale ${saleId} status is ${sale.status}, cannot exchange`,
      );
    }

    this.validateExchangeLines(sale, dto);

    const [returnDocNumber, saleDocNumber] = await Promise.all([
      this.documentNumberingService.generate(DocumentType.RETURN, sale.branchId, actor),
      this.documentNumberingService.generate(DocumentType.SALE, sale.branchId, actor),
    ]);

    const now = new Date();

    const returnSubtotal = dto.returnLines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice,
      0,
    );

    const newSubtotal = dto.newLines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice,
      0,
    );
    const newTax = dto.newLines.reduce((sum, l) => sum + l.taxAmount, 0);
    const newTotal = newSubtotal + newTax;

    const { returnDoc, newSale } = await this.dataSource.transaction(
      async (manager) => {
        const returnEntity = manager.create(ReturnEntity, {
          organizationId: actor.organizationId,
          branchId: sale.branchId,
          createdBy: actor.userId,
          documentNumber: returnDocNumber,
          originalSaleId: saleId,
          sessionId: dto.sessionId,
          subtotal: returnSubtotal,
          taxAmount: 0,
          totalAmount: returnSubtotal,
          reason: dto.reason,
          returnDate: now,
        });
        const savedReturn = await manager.save(returnEntity);

        const returnLineEntities = dto.returnLines.map((rl) =>
          manager.create(ReturnLineEntity, {
            organizationId: actor.organizationId,
            branchId: sale.branchId,
            createdBy: actor.userId,
            returnId: savedReturn.id,
            originalSaleLineId: rl.originalSaleLineId,
            itemId: rl.itemId,
            locationId: rl.locationId,
            quantity: rl.quantity,
            unitPrice: rl.unitPrice,
            lineTotal: rl.quantity * rl.unitPrice,
          }),
        );
        savedReturn.lines = await manager.save(returnLineEntities);

        const saleEntity = manager.create(SaleEntity, {
          organizationId: actor.organizationId,
          branchId: sale.branchId,
          createdBy: actor.userId,
          documentNumber: saleDocNumber,
          sessionId: dto.sessionId,
          customerId: sale.customerId,
          subtotal: newSubtotal,
          taxAmount: newTax,
          totalAmount: newTotal,
          saleDate: now,
        });
        const savedSale = await manager.save(saleEntity);

        const newLineEntities = dto.newLines.map((nl) =>
          manager.create(SaleLineEntity, {
            organizationId: actor.organizationId,
            branchId: sale.branchId,
            createdBy: actor.userId,
            saleId: savedSale.id,
            itemId: nl.itemId,
            locationId: nl.locationId,
            quantity: nl.quantity,
            unitPrice: nl.unitPrice,
            lineTotal: nl.quantity * nl.unitPrice,
            taxAmount: nl.taxAmount,
          }),
        );
        savedSale.lines = await manager.save(newLineEntities);

        if (dto.settlement) {
          const paymentEntity = manager.create(PaymentEntity, {
            organizationId: actor.organizationId,
            branchId: sale.branchId,
            createdBy: actor.userId,
            saleId: savedSale.id,
            method: dto.settlement.method,
            amount: dto.settlement.amount,
            reference: dto.settlement.reference,
          });
          savedSale.payments = [await manager.save(paymentEntity)];
        } else {
          savedSale.payments = [];
        }

        sale.status = SaleStatus.PARTIALLY_RETURNED;
        await manager.save(sale);

        return { returnDoc: savedReturn, newSale: savedSale };
      },
    );

    for (const rl of dto.returnLines) {
      await this.stockLedgerService.recordMovement({
        itemId: rl.itemId,
        locationId: rl.locationId,
        branchId: sale.branchId!,
        organizationId: actor.organizationId,
        movementType: StockMovementType.EXCHANGE_IN,
        quantity: rl.quantity,
        referenceType: 'EXCHANGE_RETURN',
        referenceId: returnDoc.id,
        actorContext: actor,
      });
    }

    for (const nl of dto.newLines) {
      await this.stockLedgerService.recordMovement({
        itemId: nl.itemId,
        locationId: nl.locationId,
        branchId: sale.branchId!,
        organizationId: actor.organizationId,
        movementType: StockMovementType.EXCHANGE_OUT,
        quantity: -nl.quantity,
        referenceType: 'EXCHANGE_SALE',
        referenceId: newSale.id,
        actorContext: actor,
      });
    }

    const journalLines = [];
    const priceDifference = newTotal - returnSubtotal;

    if (priceDifference > 0) {
      journalLines.push(
        { accountId: dto.cashAccountId, debitAmount: priceDifference, creditAmount: 0, lineOrder: 1 },
        { accountId: dto.revenueAccountId, debitAmount: 0, creditAmount: priceDifference, lineOrder: 2 },
      );
    } else if (priceDifference < 0) {
      const abs = Math.abs(priceDifference);
      journalLines.push(
        { accountId: dto.revenueAccountId, debitAmount: abs, creditAmount: 0, lineOrder: 1 },
        { accountId: dto.cashAccountId, debitAmount: 0, creditAmount: abs, lineOrder: 2 },
      );
    }

    if (journalLines.length > 0) {
      await this.journalService.post(
        {
          source: JournalSource.EXCHANGE,
          sourceReferenceId: newSale.id,
          description: `POS Exchange ${returnDocNumber}/${saleDocNumber} (original: ${sale.documentNumber})`,
          lines: journalLines,
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
        branchId: sale.branchId,
        correlationId: newSale.id,
        payload: {
          type: 'EXCHANGE',
          returnId: returnDoc.id,
          newSaleId: newSale.id,
          originalSaleId: saleId,
          priceDifference,
          actorId: actor.userId,
        },
      },
      newSale.id,
    );

    this.wsEmitter.emitToBranch(sale.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_CHECKOUT_ACKNOWLEDGED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: sale.branchId,
      correlationId: newSale.id,
      payload: {
        type: 'EXCHANGE',
        returnDocNumber,
        saleDocNumber,
        originalSaleId: saleId,
        priceDifference,
      },
    });

    this.logger.log(
      `Exchange processed: return=${returnDocNumber}, newSale=${saleDocNumber} (original=${sale.documentNumber})`,
    );

    return { returnDoc, newSale };
  }

  private validateExchangeLines(
    sale: SaleEntity,
    dto: ProcessExchangeDto,
  ): void {
    for (const rl of dto.returnLines) {
      const saleLine = sale.lines.find(
        (sl) => sl.id === rl.originalSaleLineId,
      );
      if (!saleLine) {
        throw new BadRequestException(
          `Sale line ${rl.originalSaleLineId} not found in sale ${sale.id}`,
        );
      }
      if (rl.quantity > Number(saleLine.quantity)) {
        throw new BadRequestException(
          `Exchange return quantity ${rl.quantity} exceeds original quantity ${saleLine.quantity} ` +
            `for sale line ${rl.originalSaleLineId}`,
        );
      }
    }
  }
}
