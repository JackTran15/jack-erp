import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ItemEntity } from '../location/item.entity';
import { StockBalanceEntity } from './stock-balance.entity';

export const INVENTORY_STOCK_BALANCE_SERVICE_TOKEN =
  'InventoryStockBalanceCrudService';

@Injectable()
export class InventoryStockBalanceCrudService extends BaseCrudService<
  StockBalanceEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig =
    INVENTORY_STOCK_BALANCE_ENTITY_CONFIG;

  constructor(
    @InjectRepository(StockBalanceEntity)
    protected readonly repository: Repository<StockBalanceEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override getByIdRelations(): string[] {
    return ['item'];
  }

  protected override configureListQuery(
    qb: SelectQueryBuilder<StockBalanceEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.item`, 'item');
  }

  protected override applySearch(
    qb: SelectQueryBuilder<StockBalanceEntity>,
    alias: string,
    search?: string,
  ): void {
    if (!search) return;
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where(`CAST(${alias}.itemId AS text) ILIKE :search`, {
            search: `%${search}%`,
          })
          .orWhere(`CAST(${alias}.locationId AS text) ILIKE :search`, {
            search: `%${search}%`,
          })
          .orWhere('item.name ILIKE :search', { search: `%${search}%` })
          .orWhere('item.code ILIKE :search', { search: `%${search}%` });
      }),
    );
  }

  protected override transformListResults(
    data: StockBalanceEntity[],
  ): unknown[] {
    return data.map((row) => this.flattenForList(row));
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    return super.beforeCreate(stripDerivedItemFields(payload), actor);
  }

  protected override async beforeUpdate(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    return super.beforeUpdate(id, stripDerivedItemFields(payload), actor);
  }

  private flattenForList(row: StockBalanceEntity): Record<string, unknown> {
    const item = row.item;
    const { item: _drop, ...rest } = row;
    return {
      ...rest,
      itemName: item?.name ?? '',
      itemCode: item?.code ?? '',
      itemVariants: formatItemVariantSummary(item),
    };
  }
}

function stripDerivedItemFields<T extends Record<string, any>>(payload: T): T {
  const next = { ...payload };
  delete next.itemName;
  delete next.itemCode;
  delete next.itemVariants;
  delete next.item;
  return next;
}

/** Human-readable variant / attribute line from the linked item (category, unit, description). */
function formatItemVariantSummary(item?: ItemEntity): string {
  if (!item) return '';
  const parts: string[] = [];
  if (item.category?.trim()) parts.push(item.category.trim());
  if (item.unit?.trim()) parts.push(item.unit.trim());
  const desc = item.description?.trim();
  if (desc) {
    parts.push(desc.length > 160 ? `${desc.slice(0, 157)}…` : desc);
  }
  return parts.join(' · ');
}

export const INVENTORY_STOCK_BALANCE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-stock-balances',
  displayName: 'Tồn kho',
  apiResource: 'inventory/stock/balances',
  idField: 'id',
  fields: [
    {
      key: 'itemName',
      label: 'Tên mặt hàng',
      type: 'string',
      readOnly: true,
    },
    {
      key: 'itemCode',
      label: 'Mã mặt hàng',
      type: 'string',
      readOnly: true,
    },
    {
      key: 'itemVariants',
      label: 'Biến thể / mô tả',
      type: 'string',
      readOnly: true,
    },
    { key: 'itemId', label: 'ID mặt hàng', type: 'string', required: true },
    {
      key: 'locationId',
      label: 'ID vị trí',
      type: 'string',
      required: true,
    },
    { key: 'branchId', label: 'ID chi nhánh', type: 'string' },
    { key: 'quantity', label: 'Số lượng', type: 'number' },
    { key: 'lastMovementAt', label: 'Phát sinh gần nhất', type: 'date' },
  ],
  searchableFields: ['itemId', 'locationId', 'branchId', 'itemName', 'itemCode'],
  filterDefinitions: [
    { key: 'itemId', label: 'ID mặt hàng', type: 'text' },
    { key: 'locationId', label: 'ID vị trí', type: 'text' },
    { key: 'branchId', label: 'ID chi nhánh', type: 'text' },
  ],
  permissions: {
    create: 'inventory.write',
    read: 'inventory.read',
    update: 'inventory.write',
    delete: 'inventory.write',
  },
  scopingPolicy: ScopingPolicy.BRANCH,
  deletionPolicy: DeletionPolicy.HARD,
};
