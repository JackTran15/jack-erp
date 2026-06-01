import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  ItemCategoryEntity,
  ItemCategoryStatus,
} from './item-category.entity';

export const INVENTORY_ITEM_CATEGORY_SERVICE_TOKEN =
  'InventoryItemCategoryCrudService';

@Injectable()
export class InventoryItemCategoryCrudService extends BaseCrudService<
  ItemCategoryEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig =
    INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ItemCategoryEntity)
    protected readonly repository: Repository<ItemCategoryEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    const raw = payload.name;
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name) {
      throw new BadRequestException('Tên nhóm hàng không được để trống');
    }
    return cleanCategoryPayload({ ...payload, name });
  }

  protected override async beforeUpdate(
    _id: string,
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    if (payload.name !== undefined) {
      const name =
        typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) {
        throw new BadRequestException('Tên nhóm hàng không được để trống');
      }
      return cleanCategoryPayload({ ...payload, name });
    }
    return cleanCategoryPayload(payload);
  }
}

function cleanCategoryPayload(payload: Record<string, any>): Record<string, any> {
  const next = { ...payload };
  if (next.code !== undefined) {
    const code = typeof next.code === 'string' ? next.code.trim() : '';
    next.code = code || null;
  }
  if (next.description !== undefined) {
    const description =
      typeof next.description === 'string' ? next.description.trim() : '';
    next.description = description || null;
  }
  if (next.status === undefined || next.status === null || next.status === '') {
    next.status = ItemCategoryStatus.ACTIVE;
  }
  return next;
}

export const INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-item-categories',
  displayName: 'Nhóm hàng hoá',
  apiResource: 'inventory/item-categories',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã nhóm hàng', type: 'string' },
    { key: 'name', label: 'Tên nhóm hàng', type: 'string', required: true },
    { key: 'description', label: 'Mô tả', type: 'string' },
    {
      key: 'status',
      label: 'Trạng thái',
      type: 'enum',
      enumValues: [ItemCategoryStatus.ACTIVE, ItemCategoryStatus.INACTIVE],
    },
  ],
  searchableFields: ['code', 'name', 'description'],
  filterDefinitions: [
    {
      key: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Đang kinh doanh', value: ItemCategoryStatus.ACTIVE },
        { label: 'Ngừng kinh doanh', value: ItemCategoryStatus.INACTIVE },
      ],
    },
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
