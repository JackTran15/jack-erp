import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ProductEntity } from './product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

export const PRODUCT_SERVICE_TOKEN = 'ProductCrudService';

@Injectable()
export class ProductCrudService extends BaseCrudService<
  ProductEntity,
  CreateProductDto,
  UpdateProductDto
> {
  protected readonly entityConfig: CrudEntityConfig = PRODUCT_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ProductEntity)
    protected readonly repository: Repository<ProductEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override getByIdRelations(): string[] {
    return ['defaultProvider'];
  }

  protected override applySearch(
    qb: SelectQueryBuilder<ProductEntity>,
    alias: string,
    search?: string,
  ): void {
    if (!search) return;
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where(`${alias}.name ILIKE :search`, { search: `%${search}%` })
          .orWhere(`${alias}.description ILIKE :search`, {
            search: `%${search}%`,
          });
      }),
    );
  }
}

export const PRODUCT_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'products',
  displayName: 'Sản phẩm',
  apiResource: 'products',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã sản phẩm', type: 'string' },
    { key: 'name', label: 'Tên sản phẩm', type: 'string', required: true },
    { key: 'description', label: 'Mô tả', type: 'string' },
    { key: 'isActive', label: 'Trạng thái', type: 'boolean' },
    { key: 'defaultProviderId', label: 'Nhà cung cấp mặc định', type: 'string' },
    { key: 'autoMigrated', label: 'Tự động nhập', type: 'boolean', readOnly: true },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date', readOnly: true },
  ],
  searchableFields: ['code', 'name', 'description'],
  filterDefinitions: [
    { key: 'isActive', label: 'Trạng thái', type: 'boolean' },
  ],
  permissions: {
    create: 'product.write',
    read: 'product.read',
    update: 'product.write',
    delete: 'product.write',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.SOFT,
};
