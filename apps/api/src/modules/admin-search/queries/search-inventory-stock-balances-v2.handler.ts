import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { ItemEntity } from '../../inventory/location/item.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { SearchInventoryStockBalancesV2Query } from './search-inventory-stock-balances-v2.query';

const ITEM_VARIANTS_EXPRESSION = `concat_ws(' · ',
  NULLIF(BTRIM(category.name), ''),
  NULLIF(BTRIM(item.unit), ''),
  NULLIF(BTRIM(item.description), '')
)`;

const VARIANT_LABEL_EXPRESSION = `COALESCE(item.variantLabel, ${ITEM_VARIANTS_EXPRESSION})`;

@QueryHandler(SearchInventoryStockBalancesV2Query)
export class SearchInventoryStockBalancesV2Handler
  implements IQueryHandler<SearchInventoryStockBalancesV2Query>
{
  constructor(
    @InjectRepository(StockBalanceEntity)
    private readonly repo: Repository<StockBalanceEntity>,
  ) {}

  async execute({ dto, actor }: SearchInventoryStockBalancesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('balance')
      .leftJoinAndSelect('balance.item', 'item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.product', 'product')
      .where('balance.organizationId = :orgId', {
        orgId: actor.organizationId,
      });

    if (actor.branchId) {
      qb.andWhere('balance.branchId = :actorBranchId', {
        actorBranchId: actor.branchId,
      });
    }

    new FilterBuilder(qb)
      .applyString('item.name', dto.itemName)
      .applyString('item.code', dto.itemCode)
      .applyString(ITEM_VARIANTS_EXPRESSION, dto.itemVariants)
      .applyString('product.name', dto.productName)
      .applyString(VARIANT_LABEL_EXPRESSION, dto.variantLabel)
      .applyCompare('balance.quantity', dto.quantity)
      .applyDateRange('balance.lastMovementAt', dto.lastMovementAt);

    if (dto.itemId) {
      qb.andWhere('balance.itemId = :itemId', { itemId: dto.itemId });
    }
    if (dto.locationId) {
      qb.andWhere('balance.locationId = :locationId', {
        locationId: dto.locationId,
      });
    }
    if (dto.branchId) {
      qb.andWhere('balance.branchId = :branchId', { branchId: dto.branchId });
    }
    if (dto.productId) {
      qb.andWhere('item.productId = :productId', { productId: dto.productId });
    }

    qb.orderBy('item.code', 'ASC')
      .addOrderBy('balance.locationId', 'ASC')
      .addOrderBy('balance.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const data = rows.map(flattenForList);

    return { data, total, page, limit };
  }
}

function flattenForList(row: StockBalanceEntity): Record<string, unknown> {
  const item = row.item;
  const { item: _drop, ...rest } = row;
  return {
    ...rest,
    itemName: item?.name ?? '',
    itemCode: item?.code ?? '',
    itemVariants: formatItemVariantSummary(item),
    productName: item?.product?.name ?? '',
    variantLabel: item?.variantLabel ?? formatItemVariantSummary(item),
  };
}

function formatItemVariantSummary(item?: ItemEntity): string {
  if (!item) return '';
  const parts: string[] = [];
  const categoryName = item.category?.name?.trim();
  if (categoryName) parts.push(categoryName);
  if (item.unit?.trim()) parts.push(item.unit.trim());
  const desc = item.description?.trim();
  if (desc) {
    parts.push(desc.length > 160 ? `${desc.slice(0, 157)}…` : desc);
  }
  return parts.join(' · ');
}
