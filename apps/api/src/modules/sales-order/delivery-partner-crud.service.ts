import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../crud/base-crud.service';
import { DeliveryPartnerEntity } from './entities/delivery-partner.entity';
import { SALES_CHANNEL_PERMISSION } from './sales-channel-crud.service';

/**
 * Danh mục đối tác giao hàng qua nền CRUD generic (ADR-02). Trùng mã trong cùng
 * tổ chức → 409: unique index `(organization_id, code) WHERE deleted_at IS NULL`
 * ném 23505, `BaseCrudService.create/update` đổi thành `ConflictException`.
 */
@Injectable()
export class DeliveryPartnerCrudService extends BaseCrudService<
  DeliveryPartnerEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = DELIVERY_PARTNER_ENTITY_CONFIG;

  constructor(
    @InjectRepository(DeliveryPartnerEntity)
    protected readonly repository: Repository<DeliveryPartnerEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }
}

/** DI token cho đường generic CRUD — cùng quy ước `.name` với `SALES_CHANNEL_SERVICE_TOKEN`. */
export const DELIVERY_PARTNER_SERVICE_TOKEN = DeliveryPartnerCrudService.name;

/**
 * Quyền: dùng chung quyền quản trị danh mục kênh bán (`pos.sales-channel.manage`)
 * — UOW-03 chốt không mở quyền mới cho danh mục này.
 */
export const DELIVERY_PARTNER_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'delivery-partners',
  displayName: 'Đối tác giao hàng',
  apiResource: 'delivery-partners',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã đối tác', type: 'string', required: true },
    { key: 'name', label: 'Tên đối tác', type: 'string', required: true },
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
        { label: 'Đang hoạt động', value: 'true' },
        { label: 'Ngừng hoạt động', value: 'false' },
      ],
    },
  ],
  permissions: {
    create: SALES_CHANNEL_PERMISSION,
    read: SALES_CHANNEL_PERMISSION,
    update: SALES_CHANNEL_PERMISSION,
    delete: SALES_CHANNEL_PERMISSION,
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
