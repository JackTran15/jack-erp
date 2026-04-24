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
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../../events/event-publisher.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockLedgerService } from '../../inventory/ledger/stock-ledger.service';
import { JournalService } from '../../accounting/journal/journal.service';
import {
  SaleEntity,
  SaleStatus,
  ReturnEntity,
  ReturnLineEntity,
} from '../entities';
import { ProcessReturnDto } from '../dto';

@Injectable()
export class ReturnService {
  private readonly logger = new Logger(ReturnService.name);

  constructor(
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(ReturnEntity)
    private readonly returnRepo: Repository<ReturnEntity>,
    @InjectRepository(ReturnLineEntity)
    private readonly returnLineRepo: Repository<ReturnLineEntity>,
    private readonly dataSource: DataSource,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly journalService: JournalService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async processReturn(
    saleId: string,
    dto: ProcessReturnDto,
    actor: ActorContext,
  ): Promise<ReturnEntity> {
    const sale = await this.saleRepo.findOne({
      where: { id: saleId, organizationId: actor.organizationId },
      relations: ['lines'],
    });

    if (!sale) {
      throw new BadRequestException(`Sale ${saleId} not found`);
    }

    if (sale.status !== SaleStatus.COMPLETED && sale.status !== SaleStatus.PARTIALLY_RETURNED) {
      throw new BadRequestException(
        `Sale ${saleId} status is ${sale.status}, cannot process return`,
      );
    }

    await this.validateReturnQuantities(saleId, sale, dto, actor);

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.RETURN,
      sale.branchId,
      actor,
    );

    const now = new Date();
    const subtotal = dto.lines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice,
      0,
    );
    const taxAmount = 0;
    const totalAmount = subtotal + taxAmount;

    const returnDoc = await this.dataSource.transaction(async (manager) => {
      const returnEntity = manager.create(ReturnEntity, {
        organizationId: actor.organizationId,
        branchId: sale.branchId,
        createdBy: actor.userId,
        documentNumber,
        originalSaleId: saleId,
        sessionId: dto.sessionId,
        subtotal,
        taxAmount,
        totalAmount,
        reason: dto.reason,
        returnDate: now,
      });
      const savedReturn = await manager.save(returnEntity);

      const lineEntities = dto.lines.map((line) =>
        manager.create(ReturnLineEntity, {
          organizationId: actor.organizationId,
          branchId: sale.branchId,
          createdBy: actor.userId,
          returnId: savedReturn.id,
          originalSaleLineId: line.originalSaleLineId,
          itemId: line.itemId,
          locationId: line.locationId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.quantity * line.unitPrice,
        }),
      );
      savedReturn.lines = await manager.save(lineEntities);

      const fullyReturned = await this.isFullyReturned(
        manager,
        saleId,
        sale,
        savedReturn.lines,
      );

      sale.status = fullyReturned
        ? SaleStatus.RETURNED
        : SaleStatus.PARTIALLY_RETURNED;
      await manager.save(sale);

      return savedReturn;
    });

    for (const line of dto.lines) {
      await this.stockLedgerService.recordMovement({
        itemId: line.itemId,
        locationId: line.locationId,
        branchId: sale.branchId!,
        organizationId: actor.organizationId,
        movementType: StockMovementType.RETURN_IN,
        quantity: line.quantity,
        referenceType: 'RETURN',
        referenceId: returnDoc.id,
        actorContext: actor,
      });
    }

    await this.journalService.post(
      {
        source: JournalSource.RETURN,
        sourceReferenceId: returnDoc.id,
        description: `POS Return ${documentNumber} (original sale: ${sale.documentNumber})`,
        lines: [
          {
            accountId: dto.revenueAccountId,
            debitAmount: totalAmount,
            creditAmount: 0,
            lineOrder: 1,
          },
          {
            accountId: dto.cashAccountId,
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
        branchId: sale.branchId,
        correlationId: returnDoc.id,
        payload: {
          returnId: returnDoc.id,
          documentNumber,
          originalSaleId: saleId,
          totalAmount,
          actorId: actor.userId,
        },
      },
      returnDoc.id,
    );

    this.logger.log(
      `Return processed: ${documentNumber} (return=${returnDoc.id}, sale=${saleId})`,
    );

    return returnDoc;
  }

  private async validateReturnQuantities(
    saleId: string,
    sale: SaleEntity,
    dto: ProcessReturnDto,
    actor: ActorContext,
  ): Promise<void> {
    const existingReturns = await this.returnRepo.find({
      where: { originalSaleId: saleId, organizationId: actor.organizationId },
      relations: ['lines'],
    });

    const previouslyReturnedByLine = new Map<string, number>();
    for (const ret of existingReturns) {
      for (const line of ret.lines) {
        const prev = previouslyReturnedByLine.get(line.originalSaleLineId) ?? 0;
        previouslyReturnedByLine.set(
          line.originalSaleLineId,
          prev + Number(line.quantity),
        );
      }
    }

    for (const returnLine of dto.lines) {
      const saleLine = sale.lines.find(
        (sl) => sl.id === returnLine.originalSaleLineId,
      );
      if (!saleLine) {
        throw new BadRequestException(
          `Sale line ${returnLine.originalSaleLineId} not found in sale ${saleId}`,
        );
      }

      const alreadyReturned =
        previouslyReturnedByLine.get(returnLine.originalSaleLineId) ?? 0;
      const maxReturnable = Number(saleLine.quantity) - alreadyReturned;

      if (returnLine.quantity > maxReturnable) {
        throw new BadRequestException(
          `Return quantity ${returnLine.quantity} exceeds returnable quantity ${maxReturnable} ` +
            `for sale line ${returnLine.originalSaleLineId}`,
        );
      }
    }
  }

  private async isFullyReturned(
    manager: any,
    saleId: string,
    sale: SaleEntity,
    newReturnLines: ReturnLineEntity[],
  ): Promise<boolean> {
    const existingReturnLines = await manager.find(ReturnLineEntity, {
      where: { organizationId: sale.organizationId },
    });

    const allReturnedByLine = new Map<string, number>();

    const relatedReturnLines = existingReturnLines.filter(
      (rl: ReturnLineEntity) => !newReturnLines.some((nl) => nl.id === rl.id),
    );

    for (const rl of relatedReturnLines) {
      const prev = allReturnedByLine.get(rl.originalSaleLineId) ?? 0;
      allReturnedByLine.set(rl.originalSaleLineId, prev + Number(rl.quantity));
    }

    for (const nl of newReturnLines) {
      const prev = allReturnedByLine.get(nl.originalSaleLineId) ?? 0;
      allReturnedByLine.set(nl.originalSaleLineId, prev + Number(nl.quantity));
    }

    return sale.lines.every((sl) => {
      const returned = allReturnedByLine.get(sl.id) ?? 0;
      return returned >= Number(sl.quantity);
    });
  }
}
