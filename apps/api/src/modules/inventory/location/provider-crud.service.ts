import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  DocumentType,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService, CrudOperation } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { ProviderEntity, ProviderType } from './provider.entity';
import { ItemProviderEntity } from './item-provider.entity';
import { SupplierGroupEntity } from './supplier-group.entity';

export const INVENTORY_PROVIDER_SERVICE_TOKEN = 'InventoryProviderCrudService';

@Injectable()
export class InventoryProviderCrudService extends BaseCrudService<
  ProviderEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig =
    INVENTORY_PROVIDER_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ProviderEntity)
    protected readonly repository: Repository<ProviderEntity>,
    @InjectRepository(ItemProviderEntity)
    private readonly itemProviderRepo: Repository<ItemProviderEntity>,
    @InjectRepository(SupplierGroupEntity)
    private readonly groupRepo: Repository<SupplierGroupEntity>,
    protected readonly dataSource: DataSource,
    private readonly docNumbering: DocumentNumberingService,
  ) {
    super(dataSource);
  }

  protected override configureListQuery(
    qb: SelectQueryBuilder<ProviderEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.group`, 'group');
  }

  protected override getByIdRelations(): string[] {
    return ['group'];
  }

  protected override transformListResults(data: ProviderEntity[]): unknown[] {
    return data.map((row) => {
      const { group, ...rest } = row as any;
      return { ...rest, groupName: group?.name ?? '' };
    });
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const next = this.normalizePayload(payload);
    if (!next.code) {
      next.code = await this.docNumbering.generate(
        DocumentType.SUPPLIER,
        actor.branchId,
        actor,
      );
    }
    if (next.groupId) {
      await this.ensureGroupBelongsToOrg(next.groupId, actor.organizationId);
    }
    return next;
  }

  protected override async beforeUpdate(
    _id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const next = this.normalizePayload(payload);
    if (next.groupId) {
      await this.ensureGroupBelongsToOrg(next.groupId, actor.organizationId);
    }
    return next;
  }

  protected override async validateBusinessRules(
    operation: CrudOperation,
    payload: any,
    _actor: ActorContext,
  ): Promise<void> {
    if (operation === 'delete' && payload.id) {
      const linkedCount = await this.itemProviderRepo.count({
        where: { providerId: payload.id },
      });
      if (linkedCount > 0) {
        throw new BadRequestException(
          `Cannot delete provider: ${linkedCount} item(s) still reference it`,
        );
      }
    }
  }

  private normalizePayload(p: Record<string, any>): Record<string, any> {
    const n = { ...p };
    if (n.groupId === '' || n.groupId === null) n.groupId = undefined;
    if (n.idCardIssueDate === '' || n.idCardIssueDate === null) {
      n.idCardIssueDate = undefined;
    }
    if (n.maxDebt === '' || n.maxDebt === null) n.maxDebt = undefined;
    if (n.debtTermDays === '' || n.debtTermDays === null) {
      n.debtTermDays = undefined;
    }
    return n;
  }

  private async ensureGroupBelongsToOrg(
    groupId: string,
    organizationId: string,
  ): Promise<void> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, organizationId },
    });
    if (!group) {
      throw new BadRequestException(
        `Supplier group ${groupId} not found in this organization`,
      );
    }
  }
}

export const INVENTORY_PROVIDER_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-providers',
  displayName: 'Nhà cung cấp',
  apiResource: 'inventory/providers',
  idField: 'id',
  fields: [
    // ── List-visible ───────────────────────────────────────────────────────
    { key: 'code', label: 'Mã NCC', type: 'string', readOnly: true },
    { key: 'name', label: 'Tên NCC', type: 'string', required: true },
    {
      key: 'type',
      label: 'Loại NCC',
      type: 'enum',
      enumValues: Object.values(ProviderType),
    },
    { key: 'groupName', label: 'Nhóm NCC', type: 'string', readOnly: true },
    { key: 'phone', label: 'Số điện thoại', type: 'string' },
    { key: 'address', label: 'Địa chỉ', type: 'string' },
    { key: 'isActive', label: 'Trạng thái', type: 'boolean' },
    { key: 'isCustomer', label: 'Là khách hàng', type: 'boolean' },
    // ── Form-only ──────────────────────────────────────────────────────────
    {
      key: 'groupId',
      label: 'Nhóm nhà cung cấp',
      type: 'relation',
      relationEntity: 'provider-groups',
      hideInList: true,
    },
    { key: 'email', label: 'Email', type: 'string', hideInList: true },
    {
      key: 'maxDebt',
      label: 'Số nợ tối đa',
      type: 'number',
      numberFormat: 'money',
      hideInList: true,
    },
    {
      key: 'debtTermDays',
      label: 'Hạn nợ (ngày)',
      type: 'number',
      hideInList: true,
    },
    { key: 'bankName', label: 'Ngân hàng', type: 'string', hideInList: true },
    {
      key: 'bankAccountNumber',
      label: 'Số tài khoản',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'bankBranch',
      label: 'Chi nhánh NH',
      type: 'string',
      hideInList: true,
    },
    { key: 'notes', label: 'Ghi chú', type: 'string', hideInList: true },
    // Organization-only
    { key: 'taxCode', label: 'Mã số thuế', type: 'string', hideInList: true },
    {
      key: 'contactTitle',
      label: 'Danh xưng (LH)',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'contactName',
      label: 'Họ và tên (LH)',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'contactEmail',
      label: 'Email (LH)',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'contactPhone',
      label: 'Điện thoại (LH)',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'contactPosition',
      label: 'Chức danh (LH)',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'contactAddress',
      label: 'Địa chỉ (LH)',
      type: 'string',
      hideInList: true,
    },
    // Individual-only
    {
      key: 'salutation',
      label: 'Danh xưng',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'idCardNumber',
      label: 'Số CMND',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'idCardIssueDate',
      label: 'Ngày cấp CMND',
      type: 'date',
      hideInList: true,
    },
    {
      key: 'idCardIssuePlace',
      label: 'Nơi cấp CMND',
      type: 'string',
      hideInList: true,
    },
    {
      key: 'createdAt',
      label: 'Ngày tạo',
      type: 'date',
      readOnly: true,
      hideInList: true,
    },
  ],
  searchableFields: ['code', 'name', 'email', 'phone', 'taxCode'],
  filterDefinitions: [
    {
      key: 'type',
      label: 'Loại NCC',
      type: 'select',
      options: [
        { label: 'Tổ chức', value: ProviderType.ORGANIZATION },
        { label: 'Cá nhân', value: ProviderType.INDIVIDUAL },
      ],
    },
    {
      key: 'isActive',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Đang theo dõi', value: 'true' },
        { label: 'Ngừng theo dõi', value: 'false' },
      ],
    },
    {
      key: 'isCustomer',
      label: 'Là khách hàng',
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
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.HARD,
};
