import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService, CrudOperation } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ProviderEntity } from './provider.entity';
import { ItemProviderEntity } from './item-provider.entity';

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
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
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
}

export const INVENTORY_PROVIDER_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-providers',
  displayName: 'Nhà cung cấp',
  apiResource: 'inventory/providers',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã NCC', type: 'string', required: true },
    { key: 'name', label: 'Tên NCC', type: 'string', required: true },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'phone', label: 'Điện thoại', type: 'string' },
    { key: 'notes', label: 'Ghi chú', type: 'string' },
    { key: 'isActive', label: 'Đang hoạt động', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
  ],
  searchableFields: ['code', 'name', 'email', 'phone'],
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
