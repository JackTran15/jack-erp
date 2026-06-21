import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  ProductGroupNodeDto,
  ProductGroupProductDto,
  SearchProductGroupsResponseDto,
} from '../dto/search-product-groups.dto';
import { ItemEntity } from '../item.entity';
import { ItemCategoryEntity } from '../item-category.entity';
import { ItemBarcodeEntity } from '../item-barcode.entity';
import { ProductEntity } from '../../product/product.entity';
import { StockBalanceEntity } from '../../ledger/stock-balance.entity';
import { SearchProductGroupsQuery } from './search-product-groups.query';

const UNGROUPED_KEY = '__none__';
const UNGROUPED_LABEL = 'Chưa phân nhóm';

@QueryHandler(SearchProductGroupsQuery)
export class SearchProductGroupsHandler
  implements IQueryHandler<SearchProductGroupsQuery>
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchProductGroupsQuery): Promise<SearchProductGroupsResponseDto> {
    const manager = this.dataSource.manager;
    const orgId = actor.organizationId;
    const { page, pageSize } = dto;

    // 1. Paginate the products (mẫu mã) that match the model filter.
    const pqb = manager
      .createQueryBuilder(ProductEntity, 'p')
      .where('p.organizationId = :orgId', { orgId })
      .andWhere('p.isActive = true');
    if (dto.model) {
      pqb.andWhere('(p.code ILIKE :model OR p.name ILIKE :model)', {
        model: `%${dto.model}%`,
      });
    }
    if (dto.categoryId) {
      pqb.andWhere(
        `EXISTS (SELECT 1 FROM items i WHERE i.product_id = p.id AND i.organization_id = :orgId AND i.category_id = :catId)`,
        { catId: dto.categoryId },
      );
    }
    pqb
      .orderBy('p.name', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [products, total] = await pqb.getManyAndCount();
    if (!products.length) {
      return { data: [], total, page, pageSize };
    }

    // 2. Load the variants of this product page.
    const productIds = products.map((p) => p.id);
    const items = await manager.find(ItemEntity, {
      where: { productId: In(productIds), organizationId: orgId },
      order: { code: 'ASC' },
    });
    const itemIds = items.map((i) => i.id);

    // 3. Barcodes per variant.
    const barcodes = itemIds.length
      ? await manager.find(ItemBarcodeEntity, {
          where: { itemId: In(itemIds), organizationId: orgId },
        })
      : [];
    const barcodesByItem = new Map<string, string[]>();
    for (const b of barcodes) {
      const arr = barcodesByItem.get(b.itemId) ?? [];
      arr.push(b.code);
      barcodesByItem.set(b.itemId, arr);
    }

    // 4. Category names (category lives on the item).
    const catIds = [
      ...new Set(
        items
          .map((i) => i.categoryId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const cats = catIds.length
      ? await manager.find(ItemCategoryEntity, {
          where: { id: In(catIds), organizationId: orgId },
        })
      : [];
    const catNameById = new Map(cats.map((c) => [c.id, c.name]));

    // 5. On-hand quantity per variant in the requested branch.
    const qtyByItem = new Map<string, number>();
    if (dto.branchId && itemIds.length) {
      const balances = await manager
        .createQueryBuilder(StockBalanceEntity, 'sb')
        .innerJoin('locations', 'loc', 'loc.id = sb.location_id')
        .innerJoin('storages', 's', 's.id = loc.storage_id')
        .where('sb.organization_id = :orgId', { orgId })
        .andWhere('s.branch_id = :branchId', { branchId: dto.branchId })
        .andWhere('sb.item_id IN (:...itemIds)', { itemIds })
        .select('sb.item_id', 'itemId')
        .addSelect('SUM(sb.quantity)', 'qty')
        .groupBy('sb.item_id')
        .getRawMany<{ itemId: string; qty: string }>();
      for (const r of balances) qtyByItem.set(r.itemId, Number(r.qty) || 0);
    }

    // 6. Build the category → product → variant tree.
    const itemsByProduct = new Map<string, ItemEntity[]>();
    for (const it of items) {
      if (!it.productId) continue;
      const arr = itemsByProduct.get(it.productId) ?? [];
      arr.push(it);
      itemsByProduct.set(it.productId, arr);
    }

    const byCategory = new Map<string, ProductGroupNodeDto>();
    for (const product of products) {
      const variants = itemsByProduct.get(product.id) ?? [];
      const categoryId = variants.find((v) => v.categoryId)?.categoryId ?? null;

      const productNode: ProductGroupProductDto = {
        id: product.id,
        code: product.code ?? null,
        name: product.name,
        variants: variants.map((v) => ({
          itemId: v.id,
          sku: v.code,
          barcode: (barcodesByItem.get(v.id) ?? []).join(', '),
          name: v.name,
          unit: v.unit,
          quantityOnHand: qtyByItem.get(v.id) ?? 0,
        })),
      };

      const key = categoryId ?? UNGROUPED_KEY;
      if (!byCategory.has(key)) {
        byCategory.set(key, {
          category: {
            id: categoryId,
            name: categoryId
              ? (catNameById.get(categoryId) ?? UNGROUPED_LABEL)
              : UNGROUPED_LABEL,
          },
          products: [],
        });
      }
      byCategory.get(key)!.products.push(productNode);
    }

    const data = [...byCategory.values()].sort((a, b) => {
      if (a.category.id === null) return 1;
      if (b.category.id === null) return -1;
      return a.category.name.localeCompare(b.category.name, 'vi');
    });

    return { data, total, page, pageSize };
  }
}
