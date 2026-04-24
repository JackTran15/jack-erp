import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  StockMovementType,
  PaginatedResponse,
  PaginationQuery,
  DomainEventType,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerEntryEntity } from './stock-ledger-entry.entity';
import { StockBalanceEntity } from './stock-balance.entity';

export interface RecordMovementParams {
  itemId: string;
  locationId: string;
  branchId: string;
  organizationId: string;
  movementType: StockMovementType;
  quantity: number;
  referenceType: string;
  referenceId: string;
  notes?: string;
  actorContext: ActorContext;
}

export interface LedgerQuery extends PaginationQuery {
  itemId?: string;
  locationId?: string;
  branchId?: string;
  fromDate?: string;
  toDate?: string;
  movementType?: StockMovementType;
  organizationId: string;
}

export interface BalanceQuery extends PaginationQuery {
  itemId?: string;
  locationId?: string;
  branchId?: string;
  organizationId: string;
}

@Injectable()
export class StockLedgerService {
  private readonly logger = new Logger(StockLedgerService.name);

  constructor(
    @InjectRepository(StockLedgerEntryEntity)
    private readonly ledgerRepo: Repository<StockLedgerEntryEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    private readonly dataSource: DataSource,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async recordMovement(
    params: RecordMovementParams,
  ): Promise<StockLedgerEntryEntity> {
    const entry = await this.dataSource.transaction(async (manager) => {
      const ledgerEntry = manager.create(StockLedgerEntryEntity, {
        itemId: params.itemId,
        locationId: params.locationId,
        branchId: params.branchId,
        organizationId: params.organizationId,
        movementType: params.movementType,
        quantity: params.quantity,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        notes: params.notes,
        postedAt: new Date(),
        createdBy: params.actorContext.userId,
      });
      const savedEntry = await manager.save(StockLedgerEntryEntity, ledgerEntry);

      await this.upsertBalance(manager, params);

      return savedEntry;
    });

    await this.publishMovementEvent(entry);

    return entry;
  }

  async recordBatchMovements(
    movements: RecordMovementParams[],
  ): Promise<StockLedgerEntryEntity[]> {
    if (movements.length === 0) return [];

    const entries = await this.dataSource.transaction(async (manager) => {
      const savedEntries: StockLedgerEntryEntity[] = [];
      const now = new Date();

      for (const params of movements) {
        const ledgerEntry = manager.create(StockLedgerEntryEntity, {
          itemId: params.itemId,
          locationId: params.locationId,
          branchId: params.branchId,
          organizationId: params.organizationId,
          movementType: params.movementType,
          quantity: params.quantity,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          notes: params.notes,
          postedAt: now,
          createdBy: params.actorContext.userId,
        });
        const savedEntry = await manager.save(StockLedgerEntryEntity, ledgerEntry);
        savedEntries.push(savedEntry);

        await this.upsertBalance(manager, params);
      }

      return savedEntries;
    });

    const eventMessages = entries.map((entry) => ({
      topic: ERP_TOPICS.STOCK_MOVEMENT_POSTED,
      event: {
        eventId: uuidv4(),
        eventType: DomainEventType.STOCK_MOVEMENT_POSTED,
        timestamp: new Date().toISOString(),
        organizationId: entry.organizationId,
        branchId: entry.branchId,
        correlationId: entry.referenceId,
        payload: {
          ledgerEntryId: entry.id,
          itemId: entry.itemId,
          locationId: entry.locationId,
          movementType: entry.movementType,
          quantity: entry.quantity,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
        },
      },
      key: entry.itemId,
    }));

    await this.eventPublisher.publishBatch(eventMessages);

    return entries;
  }

  async getBalance(
    itemId: string,
    locationId: string,
    organizationId: string,
  ): Promise<StockBalanceEntity | null> {
    return this.balanceRepo.findOne({
      where: { itemId, locationId, organizationId },
    });
  }

  async getBalances(
    query: BalanceQuery,
  ): Promise<PaginatedResponse<StockBalanceEntity>> {
    const where: Record<string, unknown> = {
      organizationId: query.organizationId,
    };
    if (query.branchId) where.branchId = query.branchId;
    if (query.itemId) where.itemId = query.itemId;
    if (query.locationId) where.locationId = query.locationId;

    const [data, total] = await this.balanceRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { lastMovementAt: 'DESC' },
    });
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async getLedgerEntries(
    query: LedgerQuery,
  ): Promise<PaginatedResponse<StockLedgerEntryEntity>> {
    const qb = this.ledgerRepo
      .createQueryBuilder('entry')
      .where('entry.organizationId = :organizationId', {
        organizationId: query.organizationId,
      });

    if (query.itemId) qb.andWhere('entry.itemId = :itemId', { itemId: query.itemId });
    if (query.locationId)
      qb.andWhere('entry.locationId = :locationId', { locationId: query.locationId });
    if (query.branchId)
      qb.andWhere('entry.branchId = :branchId', { branchId: query.branchId });
    if (query.movementType)
      qb.andWhere('entry.movementType = :movementType', {
        movementType: query.movementType,
      });
    if (query.fromDate)
      qb.andWhere('entry.postedAt >= :fromDate', { fromDate: query.fromDate });
    if (query.toDate)
      qb.andWhere('entry.postedAt <= :toDate', { toDate: query.toDate });

    qb.orderBy('entry.postedAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async reconstructBalance(
    itemId: string,
    locationId: string,
    organizationId: string,
  ): Promise<number> {
    const result = await this.ledgerRepo
      .createQueryBuilder('entry')
      .select('COALESCE(SUM(entry.quantity), 0)', 'total')
      .where('entry.organizationId = :organizationId', { organizationId })
      .andWhere('entry.itemId = :itemId', { itemId })
      .andWhere('entry.locationId = :locationId', { locationId })
      .getRawOne();

    return Number(result.total);
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async upsertBalance(
    manager: EntityManager,
    params: RecordMovementParams,
  ): Promise<void> {
    const existing = await manager.findOne(StockBalanceEntity, {
      where: {
        organizationId: params.organizationId,
        itemId: params.itemId,
        locationId: params.locationId,
      },
    });

    if (existing) {
      const newQuantity = Number(existing.quantity) + Number(params.quantity);

      if (newQuantity < 0) {
        this.logger.warn(
          `Negative balance detected: item=${params.itemId} location=${params.locationId} ` +
            `current=${existing.quantity} change=${params.quantity} result=${newQuantity}`,
        );
      }

      await manager.update(
        StockBalanceEntity,
        { id: existing.id },
        { quantity: newQuantity, lastMovementAt: new Date() },
      );
    } else {
      if (Number(params.quantity) < 0) {
        this.logger.warn(
          `Negative initial balance: item=${params.itemId} location=${params.locationId} ` +
            `quantity=${params.quantity}`,
        );
      }

      const balance = manager.create(StockBalanceEntity, {
        itemId: params.itemId,
        locationId: params.locationId,
        branchId: params.branchId,
        organizationId: params.organizationId,
        quantity: Number(params.quantity),
        lastMovementAt: new Date(),
        createdBy: params.actorContext.userId,
      });
      await manager.save(StockBalanceEntity, balance);
    }
  }

  private async publishMovementEvent(
    entry: StockLedgerEntryEntity,
  ): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.STOCK_MOVEMENT_POSTED,
      {
        eventId: uuidv4(),
        eventType: DomainEventType.STOCK_MOVEMENT_POSTED,
        timestamp: new Date().toISOString(),
        organizationId: entry.organizationId,
        branchId: entry.branchId,
        correlationId: entry.referenceId,
        payload: {
          ledgerEntryId: entry.id,
          itemId: entry.itemId,
          locationId: entry.locationId,
          movementType: entry.movementType,
          quantity: entry.quantity,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
        },
      },
      entry.itemId,
    );
  }
}
