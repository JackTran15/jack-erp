import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQuery } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../location/item.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';

interface ExportQuery extends PaginationQuery {
  branchId?: string;
  categoryId?: string;
  fromDate?: string;
  toDate?: string;
  locationId?: string;
  itemId?: string;
}

@Injectable()
export class CsvExportService {
  private readonly logger = new Logger(CsvExportService.name);

  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    @InjectRepository(StockLedgerEntryEntity)
    private readonly ledgerRepo: Repository<StockLedgerEntryEntity>,
  ) {}

  async exportItems(
    query: ExportQuery,
    actor: ActorContext,
  ): Promise<string> {
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.providers', 'ip', 'ip.is_primary = true')
      .leftJoinAndSelect('ip.provider', 'provider')
      .where('item.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.categoryId) {
      qb.andWhere('item.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    qb.orderBy('item.code', 'ASC');

    const items = await qb.getMany();

    const headers = ['itemCode', 'itemName', 'uom', 'category', 'isActive', 'providerCode', 'providerName'];
    const rows = items.map((item) => {
      const primary = item.providers?.find((p) => p.isPrimary);
      return [
        this.escapeCsv(item.code),
        this.escapeCsv(item.name),
        this.escapeCsv(item.unit),
        this.escapeCsv(item.category?.name ?? ''),
        item.isActive ? 'true' : 'false',
        this.escapeCsv(primary?.provider?.code ?? ''),
        this.escapeCsv(primary?.provider?.name ?? ''),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  async exportBalances(
    query: ExportQuery,
    actor: ActorContext,
  ): Promise<string> {
    const qb = this.balanceRepo
      .createQueryBuilder('bal')
      .leftJoinAndSelect('bal.item', 'item')
      .leftJoinAndSelect('bal.location', 'location')
      .where('bal.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.branchId) {
      qb.andWhere('bal.branchId = :branchId', { branchId: query.branchId });
    }
    if (query.itemId) {
      qb.andWhere('bal.itemId = :itemId', { itemId: query.itemId });
    }
    if (query.locationId) {
      qb.andWhere('bal.locationId = :locationId', { locationId: query.locationId });
    }

    qb.orderBy('bal.itemId', 'ASC').addOrderBy('bal.locationId', 'ASC');

    const balances = await qb.getMany();

    const headers = [
      'itemId',
      'locationId',
      'branchId',
      'quantity',
      'lastMovementAt',
    ];
    const rows = balances.map((b) =>
      [
        b.itemId,
        b.locationId,
        b.branchId ?? '',
        String(b.quantity),
        b.lastMovementAt?.toISOString() ?? '',
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  async exportLedger(
    query: ExportQuery,
    actor: ActorContext,
  ): Promise<string> {
    const qb = this.ledgerRepo
      .createQueryBuilder('entry')
      .where('entry.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.branchId) {
      qb.andWhere('entry.branchId = :branchId', { branchId: query.branchId });
    }
    if (query.itemId) {
      qb.andWhere('entry.itemId = :itemId', { itemId: query.itemId });
    }
    if (query.locationId) {
      qb.andWhere('entry.locationId = :locationId', { locationId: query.locationId });
    }
    if (query.fromDate) {
      qb.andWhere('entry.postedAt >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('entry.postedAt <= :toDate', { toDate: query.toDate });
    }

    qb.orderBy('entry.postedAt', 'DESC');

    const entries = await qb.getMany();

    const headers = [
      'id',
      'itemId',
      'locationId',
      'branchId',
      'movementType',
      'quantity',
      'referenceType',
      'referenceId',
      'notes',
      'postedAt',
    ];
    const rows = entries.map((e) =>
      [
        e.id,
        e.itemId,
        e.locationId,
        e.branchId ?? '',
        e.movementType,
        String(e.quantity),
        this.escapeCsv(e.referenceType),
        e.referenceId,
        this.escapeCsv(e.notes ?? ''),
        e.postedAt.toISOString(),
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
