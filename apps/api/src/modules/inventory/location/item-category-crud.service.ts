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
import { ItemCategoryEntity } from './item-category.entity';

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
      throw new BadRequestException('Tên danh mục không được để trống');
    }
    return { ...payload, name };
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
        throw new BadRequestException('Tên danh mục không được để trống');
      }
      return { ...payload, name };
    }
    return payload;
  }
}

export const INVENTORY_ITEM_CATEGORY_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-item-categories',
  displayName: 'Danh mục hàng',
  apiResource: 'inventory/item-categories',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Tên danh mục', type: 'string', required: true },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
  ],
  searchableFields: ['name'],
  filterDefinitions: [],
  permissions: {
    create: 'inventory.write',
    read: 'inventory.read',
    update: 'inventory.write',
    delete: 'inventory.write',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.HARD,
};
