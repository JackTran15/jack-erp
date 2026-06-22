import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  DocumentType,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BaseCrudService } from '../../crud/base-crud.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StorageEntity } from './storage.entity';

export const INVENTORY_STORAGE_SERVICE_TOKEN = 'InventoryStorageCrudService';

export const INVENTORY_STORAGE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-storages',
  displayName: 'Kho lưu trữ',
  apiResource: 'inventory/storages',
  idField: 'id',
  fields: [
    { key: 'code',               label: 'Mã kho',                  type: 'string',  readOnly: true },
    { key: 'name',               label: 'Tên kho',                 type: 'string',  required: true },
    { key: 'description',        label: 'Diễn giải',               type: 'string',  hideInList: true },
    { key: 'branchName',         label: 'Tên cửa hàng',            type: 'string',  readOnly: true },
    { key: 'isDefaultReceiving', label: 'Kho nhập hàng mặc định',  type: 'boolean', readOnly: true },
    { key: 'isMainStorage',      label: 'Kho showroom',            type: 'boolean', readOnly: true, hideInList: true },
    { key: 'createdAt',          label: 'Ngày tạo',                type: 'date',    readOnly: true },
  ],
  searchableFields: ['name', 'code'],
  filterDefinitions: [
    {
      key: 'isDefaultReceiving',
      label: 'Kho nhập hàng mặc định',
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
    private readonly docNumbering: DocumentNumberingService,
  ) {
    super(dataSource);
  }

  /**
   * Mã kho is system-assigned (display-only on the form): auto-generate a
   * continuous "WHxxxxxx" code via DocumentNumberingService when the caller
   * does not provide one, mirroring how supplier codes (NCC) are issued.
   */
  protected async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    if (!payload.code) {
      payload.code = await this.docNumbering.generate(
        DocumentType.WAREHOUSE,
        actor.branchId,
        actor,
      );
    }
    return payload;
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

  /**
   * isDefaultReceiving is mutated only through SetDefaultReceivingWarehouseCommand
   * (which enforces the one-per-branch invariant). Strip it from generic updates
   * so a plain PATCH cannot bypass that rule and trip the partial unique index.
   */
  protected async beforeUpdate(
    _id: string,
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    if (payload && 'isDefaultReceiving' in payload) {
      delete payload.isDefaultReceiving;
    }
    return payload;
  }

  /** The auto-generated showroom storage is load-bearing for POS and cannot be deleted. */
  protected async beforeDelete(id: string, actor: ActorContext): Promise<void> {
    const storage = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (storage?.isMainStorage) {
      throw new ConflictException(
        'Cannot delete the auto-generated showroom storage',
      );
    }
  }
}
