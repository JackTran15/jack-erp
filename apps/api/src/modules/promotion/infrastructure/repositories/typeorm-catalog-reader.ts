import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CatalogItemView, CatalogReaderPort } from '../../domain/ports/catalog-reader.port';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';

/** Matches the cycle-guard depth already used in category-import.service.ts:779. */
const MAX_CATEGORY_DEPTH = 50;

@Injectable()
export class TypeormCatalogReader implements CatalogReaderPort {
  constructor(
    @InjectRepository(ItemEntity) private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity) private readonly categoryRepo: Repository<ItemCategoryEntity>,
  ) {}

  async loadItems(orgId: string, itemIds: string[]): Promise<Map<string, CatalogItemView>> {
    const result = new Map<string, CatalogItemView>();
    if (itemIds.length === 0) return result;

    const [items, categories] = await Promise.all([
      this.itemRepo.find({ where: { id: In(itemIds), organizationId: orgId } }),
      // The whole org's category tree, loaded once, so ancestor paths can be
      // built in RAM instead of a recursive CTE or a query per item.
      this.categoryRepo.find({ where: { organizationId: orgId } }),
    ]);
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    for (const item of items) {
      result.set(item.id, {
        itemId: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        sellingPrice: Number(item.sellingPrice),
        productId: item.productId,
        categoryId: item.categoryId,
        categoryPathIds: item.categoryId ? this.buildPath(item.categoryId, categoryById) : [],
      });
    }

    return result;
  }

  /** A malformed tree (parentGroupId cycle) stops at MAX_CATEGORY_DEPTH instead of looping forever. */
  private buildPath(categoryId: string, byId: Map<string, ItemCategoryEntity>): string[] {
    const path: string[] = [];
    let cursor: string | undefined = categoryId;
    let guard = 0;
    while (cursor && guard++ < MAX_CATEGORY_DEPTH) {
      path.push(cursor);
      cursor = byId.get(cursor)?.parentGroupId ?? undefined;
    }
    return path;
  }
}
