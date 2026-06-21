import { ItemEntity } from '../item.entity';
import { ItemCategoryEntity } from '../item-category.entity';
import { ItemBarcodeEntity } from '../item-barcode.entity';
import { ProductEntity } from '../../product/product.entity';
import { StockBalanceEntity } from '../../ledger/stock-balance.entity';
import { SearchProductGroupsHandler } from './search-product-groups.handler';
import { SearchProductGroupsQuery } from './search-product-groups.query';

const actor = { organizationId: 'org1', userId: 'u1', roles: [] } as never;

interface Cfg {
  products: unknown[];
  total: number;
  items?: unknown[];
  barcodes?: unknown[];
  cats?: unknown[];
  balances?: { itemId: string; qty: string }[];
}

function makeHandler(cfg: Cfg): SearchProductGroupsHandler {
  const manager = {
    createQueryBuilder: (entity: unknown) => {
      const qb: Record<string, unknown> = {};
      for (const m of [
        'where', 'andWhere', 'orderBy', 'skip', 'take',
        'innerJoin', 'select', 'addSelect', 'groupBy',
      ]) {
        qb[m] = () => qb;
      }
      if (entity === ProductEntity) {
        qb.getManyAndCount = async () => [cfg.products, cfg.total];
      }
      if (entity === StockBalanceEntity) {
        qb.getRawMany = async () => cfg.balances ?? [];
      }
      return qb;
    },
    find: async (entity: unknown) => {
      if (entity === ItemEntity) return cfg.items ?? [];
      if (entity === ItemBarcodeEntity) return cfg.barcodes ?? [];
      if (entity === ItemCategoryEntity) return cfg.cats ?? [];
      return [];
    },
  };
  return new SearchProductGroupsHandler({ manager } as never);
}

describe('SearchProductGroupsHandler', () => {
  it('nests category → model → variants with barcodes and branch on-hand', async () => {
    const handler = makeHandler({
      products: [{ id: 'p1', code: 'M1', name: 'Model One', isActive: true }],
      total: 1,
      items: [
        { id: 'v1', productId: 'p1', code: 'M1-A', name: 'Var A', unit: 'cái', categoryId: 'cat1' },
        { id: 'v2', productId: 'p1', code: 'M1-B', name: 'Var B', unit: 'cái', categoryId: 'cat1' },
      ],
      barcodes: [{ itemId: 'v1', code: 'BAR1' }],
      cats: [{ id: 'cat1', name: 'Giày' }],
      balances: [{ itemId: 'v1', qty: '5' }],
    });

    const res = await handler.execute(
      new SearchProductGroupsQuery({ branchId: 'b1', page: 1, pageSize: 20 }, actor),
    );

    expect(res.total).toBe(1);
    expect(res.data).toHaveLength(1);
    const node = res.data[0];
    expect(node.category).toEqual({ id: 'cat1', name: 'Giày' });
    expect(node.products[0]).toMatchObject({ id: 'p1', code: 'M1', name: 'Model One' });

    const variants = node.products[0].variants;
    expect(variants).toHaveLength(2);
    expect(variants[0]).toEqual({
      itemId: 'v1', sku: 'M1-A', barcode: 'BAR1', name: 'Var A', unit: 'cái', quantityOnHand: 5,
    });
    expect(variants[1]).toMatchObject({ itemId: 'v2', barcode: '', quantityOnHand: 0 });
  });

  it('returns an empty tree when no model matches', async () => {
    const handler = makeHandler({ products: [], total: 0 });
    const res = await handler.execute(
      new SearchProductGroupsQuery({ model: 'zzz', page: 1, pageSize: 20 }, actor),
    );
    expect(res).toMatchObject({ data: [], total: 0 });
  });
});
