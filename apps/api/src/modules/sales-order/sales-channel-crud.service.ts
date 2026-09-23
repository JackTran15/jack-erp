import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../crud/base-crud.service';
import { SalesChannelEntity } from './entities/sales-channel.entity';

/**
 * Quyền khai báo kênh bán. Tách khỏi `pos.sales-order.*` có chủ đích: người bán
 * đơn không phải người mở kênh — mở một kênh là mở một cửa nhận đơn từ bên ngoài.
 */
export const SALES_CHANNEL_PERMISSION = 'pos.sales-channel.manage';

@Injectable()
export class SalesChannelCrudService extends BaseCrudService<
  SalesChannelEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = SALES_CHANNEL_ENTITY_CONFIG;

  constructor(
    @InjectRepository(SalesChannelEntity)
    protected readonly repository: Repository<SalesChannelEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }
}

/**
 * DI token cho đường generic CRUD. Lấy từ `.name` thay vì viết chuỗi: giá trị ra
 * y hệt tên class (`'SalesChannelCrudService'`, cùng quy ước với
 * `PROVIDER_GROUP_SERVICE_TOKEN` và các entity đã đăng ký), nhưng không còn một
 * chuỗi literal để đổi lệch khi đổi tên class.
 */
export const SALES_CHANNEL_SERVICE_TOKEN = SalesChannelCrudService.name;

export const SALES_CHANNEL_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'sales-channels',
  displayName: 'Kênh bán hàng',
  apiResource: 'sales-channels',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã kênh', type: 'string', required: true },
    { key: 'name', label: 'Tên kênh', type: 'string', required: true },
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
