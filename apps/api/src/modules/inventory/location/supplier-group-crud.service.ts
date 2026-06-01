import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { SupplierGroupEntity } from './supplier-group.entity';

export const PROVIDER_GROUP_SERVICE_TOKEN = 'ProviderGroupCrudService';

@Injectable()
export class ProviderGroupCrudService extends BaseCrudService<
  SupplierGroupEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = PROVIDER_GROUP_ENTITY_CONFIG;

  constructor(
    @InjectRepository(SupplierGroupEntity)
    protected readonly repository: Repository<SupplierGroupEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override configureListQuery(
    qb: SelectQueryBuilder<SupplierGroupEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.parentGroup`, 'parentGroup');
  }

  protected override getByIdRelations(): string[] {
    return ['parentGroup'];
  }

  protected override transformListResults(data: SupplierGroupEntity[]): unknown[] {
    return data.map((row) => {
      const { parentGroup, ...rest } = row as any;
      return { ...rest, parentGroupName: parentGroup?.name ?? '' };
    });
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const next = this.normalizePayload(payload);
    if (next.parentGroupId) {
      await this.validateParentExists(next.parentGroupId, actor);
    }
    return next;
  }

  protected override async beforeUpdate(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const next = this.normalizePayload(payload);
    if (next.parentGroupId) {
      if (next.parentGroupId === id) {
        throw new BadRequestException('A supplier group cannot be its own parent');
      }
      await this.validateParentExists(next.parentGroupId, actor);
    }
    return next;
  }

  private normalizePayload(p: Record<string, any>): Record<string, any> {
    const n = { ...p };
    if (n.parentGroupId === '' || n.parentGroupId === null) {
      n.parentGroupId = undefined;
    }
    return n;
  }

  private async validateParentExists(
    parentGroupId: string,
    actor: ActorContext,
  ): Promise<void> {
    const parent = await this.repository.findOne({
      where: { id: parentGroupId, organizationId: actor.organizationId },
    });
    if (!parent) {
      throw new BadRequestException(
        `Parent supplier group ${parentGroupId} not found`,
      );
    }
  }
}

export const PROVIDER_GROUP_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'provider-groups',
  displayName: 'Nhóm nhà cung cấp',
  apiResource: 'inventory/provider-groups',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã nhóm NCC', type: 'string', required: true },
    { key: 'name', label: 'Tên nhóm NCC', type: 'string', required: true },
    { key: 'parentGroupName', label: 'Thuộc nhóm NCC', type: 'string', readOnly: true },
    {
      key: 'parentGroupId',
      label: 'Thuộc nhóm NCC',
      type: 'relation',
      relationEntity: 'provider-groups',
      hideInList: true,
    },
    { key: 'description', label: 'Mô tả', type: 'string' },
    { key: 'isActive', label: 'Trạng thái', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', hideInList: true },
  ],
  searchableFields: ['code', 'name'],
  filterDefinitions: [
    {
      key: 'isActive',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Đang theo dõi', value: 'true' },
        { label: 'Ngừng theo dõi', value: 'false' },
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
