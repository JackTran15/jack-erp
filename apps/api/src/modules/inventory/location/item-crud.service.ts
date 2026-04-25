import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ItemEntity } from './item.entity';
import { ProviderEntity } from './provider.entity';

export const INVENTORY_ITEM_SERVICE_TOKEN = 'InventoryItemCrudService';

@Injectable()
export class InventoryItemCrudService extends BaseCrudService<
  ItemEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = INVENTORY_ITEM_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ItemEntity)
    protected readonly repository: Repository<ItemEntity>,
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override getByIdRelations(): string[] {
    return ['provider'];
  }

  protected override configureListQuery(
    qb: SelectQueryBuilder<ItemEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.provider`, 'provider');
  }

  protected override applySearch(
    qb: SelectQueryBuilder<ItemEntity>,
    alias: string,
    search?: string,
  ): void {
    if (!search) return;
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where(`${alias}.code ILIKE :search`, { search: `%${search}%` })
          .orWhere(`${alias}.name ILIKE :search`, { search: `%${search}%` })
          .orWhere(`${alias}.category ILIKE :search`, { search: `%${search}%` })
          .orWhere('provider.name ILIKE :search', { search: `%${search}%` })
          .orWhere('provider.code ILIKE :search', { search: `%${search}%` });
      }),
    );
  }

  protected override transformListResults(data: ItemEntity[]): unknown[] {
    return data.map((row) => {
      const provider = row.provider;
      const { provider: _drop, ...rest } = row;
      return {
        ...rest,
        providerName: provider?.name ?? '',
        providerCode: provider?.code ?? '',
      };
    });
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const cleaned = stripDerivedProviderFields(payload);
    if (cleaned.providerId) {
      await this.ensureProviderBelongsToOrg(cleaned.providerId, actor);
    }
    return super.beforeCreate(cleaned, actor);
  }

  protected override async beforeUpdate(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const cleaned = stripDerivedProviderFields(payload);
    if (cleaned.providerId) {
      await this.ensureProviderBelongsToOrg(cleaned.providerId, actor);
    }
    return super.beforeUpdate(id, cleaned, actor);
  }

  private async ensureProviderBelongsToOrg(
    providerId: string,
    actor: ActorContext,
  ): Promise<void> {
    const provider = await this.providerRepo.findOne({
      where: { id: providerId, organizationId: actor.organizationId },
    });
    if (!provider) {
      throw new BadRequestException(
        `Provider ${providerId} not found in this organization`,
      );
    }
  }
}

function stripDerivedProviderFields<T extends Record<string, any>>(payload: T): T {
  const next = { ...payload };
  delete next.providerName;
  delete next.providerCode;
  delete next.provider;
  return next;
}

export const INVENTORY_ITEM_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-items',
  displayName: 'Mặt hàng kho',
  apiResource: 'inventory/items',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'name', label: 'Tên', type: 'string', required: true },
    { key: 'unit', label: 'Đơn vị', type: 'string', required: true },
    { key: 'category', label: 'Danh mục', type: 'string' },
    { key: 'purchasePrice', label: 'Giá mua', type: 'number', required: true },
    { key: 'sellingPrice', label: 'Giá bán', type: 'number', required: true },
    { key: 'providerId', label: 'ID NCC', type: 'string', required: true },
    { key: 'providerName', label: 'Tên NCC', type: 'string', readOnly: true },
    { key: 'providerCode', label: 'Mã NCC', type: 'string', readOnly: true },
    { key: 'isActive', label: 'Đang hoạt động', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
  ],
  searchableFields: ['code', 'name', 'category', 'providerName', 'providerCode'],
  filterDefinitions: [
    {
      key: 'isActive',
      label: 'Đang hoạt động',
      type: 'select',
      options: [
        { label: 'Có', value: 'true' },
        { label: 'Không', value: 'false' },
      ],
    },
    { key: 'providerId', label: 'ID NCC', type: 'text' },
  ],
  permissions: {
    create: 'inventory.write',
    read: 'inventory.read',
    update: 'inventory.write',
    delete: 'inventory.write',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.HARD,
};
