import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CrudEntityConfig,
  DeletionPolicy,
  ScopingPolicy,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';

export const INVENTORY_ITEM_SERVICE_TOKEN = 'InventoryItemCrudService';

@Injectable()
export class InventoryItemCrudService extends BaseCrudService<
  ItemEntity,
  Record<string, any>,
  Record<string, any>
> {
  protected readonly entityConfig: CrudEntityConfig = INVENTORY_ITEM_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ItemEntity)
    protected readonly repository: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categoryRepo: Repository<ItemCategoryEntity>,
    protected readonly dataSource: DataSource,
  ) {
    super(dataSource);
  }

  protected override getByIdRelations(): string[] {
    return ['category', 'product'];
  }

  protected override configureListQuery(
    qb: SelectQueryBuilder<ItemEntity>,
    alias: string,
  ): void {
    qb.leftJoinAndSelect(`${alias}.category`, 'category');
    qb.leftJoinAndSelect(`${alias}.product`, 'product');
  }

  protected override applySearch(
    qb: SelectQueryBuilder<ItemEntity>,
    alias: string,
    search?: string,
  ): void {
    if (!search) return;
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where(`${alias}.code ILIKE :search`, { search: `%${search}%` })
          .orWhere(`${alias}.name ILIKE :search`, { search: `%${search}%` })
          .orWhere('category.name ILIKE :search', { search: `%${search}%` })
          .orWhere('product.name ILIKE :search', { search: `%${search}%` });
      }),
    );
  }

  protected override transformListResults(data: ItemEntity[]): unknown[] {
    return data.map((row) => {
      const category = row.category;
      const product = row.product;
      const { category: _dropCategory, product: _dropProduct, ...rest } = row;
      return {
        ...rest,
        categoryName: category?.name ?? '',
        productName: product?.name ?? '',
        variantLabel: row.variantLabel ?? '',
      };
    });
  }

  protected override async beforeCreate(
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const cleaned = stripDerivedFields(payload);
    if (cleaned.categoryId) {
      await this.ensureCategoryBelongsToOrg(cleaned.categoryId, actor);
    }
    return super.beforeCreate(cleaned, actor);
  }

  protected override async beforeUpdate(
    id: string,
    payload: Record<string, any>,
    actor: ActorContext,
  ): Promise<Record<string, any>> {
    const cleaned = stripDerivedFields(payload);
    if (cleaned.categoryId) {
      await this.ensureCategoryBelongsToOrg(cleaned.categoryId, actor);
    }
    return super.beforeUpdate(id, cleaned, actor);
  }

  private async ensureCategoryBelongsToOrg(
    categoryId: string,
    actor: ActorContext,
  ): Promise<void> {
    const cat = await this.categoryRepo.findOne({
      where: { id: categoryId, organizationId: actor.organizationId },
    });
    if (!cat) {
      throw new BadRequestException(
        `Danh mục ${categoryId} không tồn tại trong tổ chức`,
      );
    }
  }
}

function stripDerivedFields<T extends Record<string, any>>(payload: T): T {
  const next = { ...payload };
  delete next.categoryName;
  delete next.category;
  delete next.productName;
  delete next.product;
  delete next.providers;
  delete next.barcodes;
  delete next.thresholds;
  return next;
}

export const INVENTORY_ITEM_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'inventory-items',
  displayName: 'Mặt hàng kho',
  apiResource: 'inventory/items',
  idField: 'id',
  fields: [
    { key: 'code', label: 'Mã', type: 'string', required: true },
    { key: 'name', label: 'Tên', type: 'string', required: true },
    { key: 'unit', label: 'Đơn vị', type: 'string', required: true },
    { key: 'categoryId', label: 'ID Danh mục', type: 'string' },
    { key: 'categoryName', label: 'Danh mục', type: 'string', readOnly: true },
    {
      key: 'purchasePrice',
      label: 'Giá mua',
      type: 'number',
      numberFormat: 'money',
      required: true,
    },
    {
      key: 'sellingPrice',
      label: 'Giá bán',
      type: 'number',
      numberFormat: 'money',
      required: true,
    },
    { key: 'isPosVisible', label: 'Hiển thị POS', type: 'boolean' },
    { key: 'weightGram', label: 'Trọng lượng (g)', type: 'number' },
    { key: 'lengthCm', label: 'Dài (cm)', type: 'number' },
    { key: 'widthCm', label: 'Rộng (cm)', type: 'number' },
    { key: 'heightCm', label: 'Cao (cm)', type: 'number' },
    { key: 'manufactureYear', label: 'Năm sản xuất', type: 'number' },
    { key: 'composition', label: 'Thành phần', type: 'string' },
    { key: 'productId', label: 'ID Sản phẩm', type: 'string' },
    { key: 'productName', label: 'Tên sản phẩm', type: 'string', readOnly: true },
    { key: 'variantLabel', label: 'Biến thể', type: 'string', readOnly: true },
    { key: 'isActive', label: 'Đang hoạt động', type: 'boolean' },
    { key: 'createdAt', label: 'Ngày tạo', type: 'date' },
  ],
  searchableFields: ['code', 'name', 'categoryName', 'productName'],
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
    {
      key: 'isPosVisible',
      label: 'Hiển thị POS',
      type: 'select',
      options: [
        { label: 'Có', value: 'true' },
        { label: 'Không', value: 'false' },
      ],
    },
    { key: 'categoryId', label: 'ID Danh mục', type: 'text' },
    { key: 'productId', label: 'ID Sản phẩm', type: 'text' },
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
