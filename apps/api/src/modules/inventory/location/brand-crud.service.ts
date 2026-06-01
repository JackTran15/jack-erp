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
import { BrandEntity } from './brand.entity';

export const BRAND_SERVICE_TOKEN = 'BrandCrudService';

@Injectable()
export class BrandCrudService extends BaseCrudService<
  BrandEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = BRAND_ENTITY_CONFIG;

  constructor(
    @InjectRepository(BrandEntity)
    protected readonly repository: Repository<BrandEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) throw new BadRequestException('Brand name is required');
    return { ...payload, name };
  }

  protected override async beforeUpdate(
    _id: string,
    payload: Record<string, any>,
    _actor: ActorContext,
  ): Promise<Record<string, any>> {
    if (payload.name !== undefined) {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!name) throw new BadRequestException('Brand name is required');
      return { ...payload, name };
    }
    return payload;
  }
}

export const BRAND_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-brands',
  displayName: 'Thương hiệu',
  apiResource: 'inventory/brands',
  idField: 'id',
  fields: [
    { key: 'name', label: 'Tên thương hiệu', type: 'string', required: true },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', readOnly: true, hideInList: true },
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
