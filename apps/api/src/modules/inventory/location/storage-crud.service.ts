import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
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
    { key: 'code',               label: 'Mã kho',                  type: 'string',  skipOnDuplicate: true },
    { key: 'name',               label: 'Tên kho',                 type: 'string',  required: true },
    { key: 'description',        label: 'Diễn giải',               type: 'string',  hideInList: true },
    { key: 'branchName',         label: 'Tên cửa hàng',            type: 'string',  readOnly: true },
    { key: 'isDefaultReceiving', label: 'Kho nhập hàng mặc định',  type: 'boolean', readOnly: true },
    { key: 'isActive',           label: 'Trạng thái',              type: 'boolean', readOnly: true },
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
    {
      key: 'isActive',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Đang hoạt động', value: 'true' },
        { label: 'Ngừng hoạt động', value: 'false' },
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
   * "code" is unique per branch (partial index UQ_storages_code_per_branch).
   * Pre-check it here rather than relying on the generic 23505 handler in
   * BaseCrudService, which cannot tell a code collision apart from a name
   * collision (@Unique(['branchId','name'])) and reports it as org-scoped.
   */
  private async assertCodeAvailable(
    code: string,
    branchId: string | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!branchId) return;
    const clash = await this.repository.findOne({ where: { branchId, code } });
    if (clash && clash.id !== excludeId) {
      throw new ConflictException(
        `Mã kho "${code}" đã tồn tại trong cửa hàng này.`,
      );
    }
  }

  /**
   * Mã kho is user-editable: keep whatever the caller typed (after trimming and
   * a per-branch uniqueness check) and only auto-generate a continuous
   * "WHxxxxxx" code via DocumentNumberingService when it is left blank,
   * mirroring how supplier codes (NCC) are issued.
   */
  protected async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const code =
      typeof payload.code === 'string' ? payload.code.trim() : payload.code;
    if (!code) {
      payload.code = await this.docNumbering.generate(
        DocumentType.WAREHOUSE,
        actor.branchId,
        actor,
      );
      return payload;
    }
    await this.assertCodeAvailable(code, actor.branchId);
    payload.code = code;
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
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    if (payload && 'isDefaultReceiving' in payload) {
      delete payload.isDefaultReceiving;
    }
    const editsCode = Boolean(payload) && 'code' in payload;
    const deactivates = Boolean(payload) && payload.isActive === false;
    if (!editsCode && !deactivates) return payload;

    const storage = await this.repository.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    // Inactive storage: block the showroom storage and the default receiving storage of the branch.
    if (deactivates) {
      if (storage?.isMainStorage) {
        throw new BadRequestException(
          'Không thể ngừng hoạt động kho showroom (kho bán hàng mặc định).',
        );
      }
      if (storage?.isDefaultReceiving) {
        throw new BadRequestException(
          'Không thể ngừng hoạt động kho nhập hàng mặc định. Hãy đặt kho khác làm kho nhập mặc định trước.',
        );
      }
    }

    // Mã kho is user-editable but stays required and unique within the branch.
    // normalizeBlankValues only nulls out relation/date/number/enum fields, so a
    // blank string would otherwise be persisted verbatim.
    if (editsCode) {
      const code = typeof payload.code === 'string' ? payload.code.trim() : '';
      if (!code) {
        throw new BadRequestException('Mã kho không được để trống.');
      }
      await this.assertCodeAvailable(code, storage?.branchId, id);
      payload.code = code;
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
