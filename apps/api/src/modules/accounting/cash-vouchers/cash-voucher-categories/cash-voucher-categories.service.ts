import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../../crud/base-crud.service';
import { CashVoucherCategoryEntity } from './cash-voucher-category.entity';

export const CASH_VOUCHER_CATEGORY_SERVICE_TOKEN = 'CashVoucherCategoryCrudService';

@Injectable()
export class CashVoucherCategoriesService extends BaseCrudService<
  CashVoucherCategoryEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig =
    CASH_VOUCHER_CATEGORY_ENTITY_CONFIG;

  constructor(
    @InjectRepository(CashVoucherCategoryEntity)
    protected readonly repository: Repository<CashVoucherCategoryEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }
}

export const CASH_VOUCHER_CATEGORY_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'cash-voucher-categories',
  displayName: 'Mục thu / Mục chi',
  apiResource: 'admin/entities/cash-voucher-categories',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'name', label: 'Tên', type: 'string', required: true },
    { key: 'description', label: 'Mô tả', type: 'string' },
    {
      key: 'direction',
      label: 'Loại',
      type: 'enum',
      required: true,
      enumValues: ['IN', 'OUT'],
    },
    { key: 'isActive', label: 'Đang hoạt động', type: 'boolean' },
    { key: 'displayOrder', label: 'Thứ tự hiển thị', type: 'number' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', readOnly: true },
  ],
  searchableFields: ['code', 'name'],
  filterDefinitions: [
    {
      key: 'direction',
      label: 'Loại',
      type: 'select',
      options: [
        { label: 'Thu', value: 'IN' },
        { label: 'Chi', value: 'OUT' },
      ],
    },
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
    create: 'accounting.cash_voucher_category.create',
    read: 'accounting.cash_voucher_category.read',
    update: 'accounting.cash_voucher_category.update',
    delete: 'accounting.cash_voucher_category.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
