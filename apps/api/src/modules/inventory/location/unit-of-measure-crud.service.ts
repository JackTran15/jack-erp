import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { UnitOfMeasureEntity } from './unit-of-measure.entity';
import { ItemEntity } from './item.entity';
import { ItemUnitEntity } from './item-unit.entity';

export const UNIT_OF_MEASURE_SERVICE_TOKEN = 'UnitOfMeasureCrudService';

@Injectable()
export class UnitOfMeasureCrudService extends BaseCrudService<
  UnitOfMeasureEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = UNIT_OF_MEASURE_ENTITY_CONFIG;

  constructor(
    @InjectRepository(UnitOfMeasureEntity)
    protected readonly repository: Repository<UnitOfMeasureEntity>,
    @InjectRepository(ItemEntity)
    private readonly itemRepository: Repository<ItemEntity>,
    @InjectRepository(ItemUnitEntity)
    private readonly itemUnitRepository: Repository<ItemUnitEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) throw new BadRequestException('Tên đơn vị tính không được để trống');
    return { ...payload, name };
  }

  protected override async beforeUpdate(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    // Không cho ngừng theo dõi (isActive=false) đơn vị tính đang được sử dụng.
    if (payload.isActive === false) {
      const existing = await this.repository.findOne({
        where: { id, organizationId: actor.organizationId },
      });
      if (existing && (await this.isUnitInUse(existing.name, actor.organizationId))) {
        throw new BadRequestException(
          'Không thể ngừng theo dõi đơn vị tính đang được sử dụng',
        );
      }
    }

    if (payload.name !== undefined) {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) throw new BadRequestException('Tên đơn vị tính không được để trống');
      return { ...payload, name };
    }
    return payload;
  }

  /** Đơn vị được coi là "đang dùng" nếu có item lấy nó làm đơn vị gốc
   *  (ItemEntity.unit) hoặc đơn vị quy đổi (ItemUnitEntity.unitName). */
  private async isUnitInUse(
    unitName: string,
    organizationId: string,
  ): Promise<boolean> {
    const [itemCount, itemUnitCount] = await Promise.all([
      this.itemRepository.count({ where: { organizationId, unit: unitName } }),
      this.itemUnitRepository.count({
        where: { organizationId, unitName },
      }),
    ]);
    return itemCount > 0 || itemUnitCount > 0;
  }
}

export const UNIT_OF_MEASURE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-item-units',
  displayName: 'Đơn vị tính',
  apiResource: 'inventory/item-units',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Đơn vị tính', type: 'string', required: true },
    { key: 'description', label: 'Diễn giải', type: 'string' },
    { key: 'isActive', label: 'Trạng thái', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', readOnly: true, hideInList: true },
  ],
  searchableFields: ['name', 'description'],
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
