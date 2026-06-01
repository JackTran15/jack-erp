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
    _id: string,
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    if (payload.name !== undefined) {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) throw new BadRequestException('Tên đơn vị tính không được để trống');
      return { ...payload, name };
    }
    return payload;
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
