import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { StorageEntity } from './storage.entity';

export const INVENTORY_STORAGE_SERVICE_TOKEN = 'InventoryStorageCrudService';

export const INVENTORY_STORAGE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-storages',
  displayName: 'Kho lưu trữ',
  apiResource: 'inventory/storages',
  idField: 'id',
  fields: [
    { key: 'name',          label: 'Tên kho',       type: 'string',  required: true },
    { key: 'branchName',    label: 'Tên cửa hàng',  type: 'string',  readOnly: true },
    { key: 'isMainStorage', label: 'Kho chính',     type: 'boolean' },
    { key: 'createdAt',     label: 'Ngày tạo',      type: 'date',    readOnly: true },
  ],
  searchableFields: ['name'],
  filterDefinitions: [
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

  protected configureListQuery(
    qb: SelectQueryBuilder<StorageEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.branch`, 'branch');
  }

  protected transformListResults(data: StorageEntity[]): unknown[] {
    return data.map((row) => ({
      ...row,
      branchName: row.branch?.name ?? '—',
    }));
  }

  protected getByIdRelations(): string[] {
    return ['branch'];
  }
}
