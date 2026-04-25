import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { StorageEntity } from './storage.entity';

export const INVENTORY_STORAGE_SERVICE_TOKEN = 'InventoryStorageCrudService';

@Injectable()
export class InventoryStorageCrudService extends BaseCrudService<
  StorageEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig =
    INVENTORY_STORAGE_ENTITY_CONFIG;

  constructor(
    @InjectRepository(StorageEntity)
    protected readonly repository: Repository<StorageEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }
}

export const INVENTORY_STORAGE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-storages',
  displayName: 'Kho lưu trữ',
  apiResource: 'inventory/storages',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Tên', type: 'string', required: true },
    { key: 'branchId', label: 'ID chi nhánh', type: 'string', required: true },
    { key: 'isMainStorage', label: 'Kho chính', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
  ],
  searchableFields: ['name', 'branchId'],
  filterDefinitions: [
    { key: 'branchId', label: 'ID chi nhánh', type: 'text' },
    {
      key: 'isMainStorage',
      label: 'Kho chính',
      type: 'select',
      options: [
        { label: 'Có', value: 'true' },
        { label: 'Không', value: 'false' },
      ],
    },
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
