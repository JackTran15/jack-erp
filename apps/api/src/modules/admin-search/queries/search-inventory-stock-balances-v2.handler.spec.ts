import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { SearchInventoryStockBalancesV2Handler } from './search-inventory-stock-balances-v2.handler';
import { SearchInventoryStockBalancesV2Query } from './search-inventory-stock-balances-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(result: [unknown[], number]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchInventoryStockBalancesV2Handler', () => {
  let handler: SearchInventoryStockBalancesV2Handler;
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchInventoryStockBalancesV2Handler,
        { provide: getRepositoryToken(StockBalanceEntity), useValue: repo },
      ],
    }).compile();
    handler = module.get(SearchInventoryStockBalancesV2Handler);
  }

  it('scopes by organization, joins item/category/product, and uses deterministic default sort', async () => {
    await build([]);

    await handler.execute(new SearchInventoryStockBalancesV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('balance.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.leftJoinAndSelect.mock.calls).toEqual([
      ['balance.item', 'item'],
      ['item.category', 'category'],
      ['item.product', 'product'],
    ]);
    expect(qb.orderBy).toHaveBeenCalledWith('item.code', 'ASC');
    expect(qb.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'balance.locationId',
      'ASC',
    );
    expect(qb.addOrderBy).toHaveBeenNthCalledWith(2, 'balance.id', 'ASC');
  });

  it('confines results to the active actor branch when present', async () => {
    await build([]);

    await handler.execute(
      new SearchInventoryStockBalancesV2Query(
        {},
        { ...actor, branchId: 'branch-active' },
      ),
    );

    expect(qb.andWhere).toHaveBeenCalledWith(
      'balance.branchId = :actorBranchId',
      { actorBranchId: 'branch-active' },
    );
  });

  it('applies requested string, compare, date-range, and exact UUID filters', async () => {
    await build([]);

    await handler.execute(
      new SearchInventoryStockBalancesV2Query(
        {
          itemName: { operator: StringOperator.CONTAINS, value: 'Áo' },
          itemCode: { operator: StringOperator.STARTS_WITH, value: 'SKU' },
          itemVariants: {
            operator: StringOperator.CONTAINS,
            value: 'Quần áo',
          },
          productName: {
            operator: StringOperator.EQUALS,
            value: 'Áo thun',
          },
          variantLabel: {
            operator: StringOperator.CONTAINS,
            value: 'Đỏ',
          },
          itemId: 'item-1',
          locationId: 'location-1',
          branchId: 'branch-1',
          productId: 'product-1',
          quantity: { operator: CompareOperator.GTE, value: 5 },
          lastMovementAt: { from: '2026-05-01', to: '2026-05-31' },
        },
        actor,
      ),
    );

    const sql = qb.andWhere.mock.calls.map((call: unknown[]) => call[0]);
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('item.name ILIKE'),
        expect.stringContaining('item.code ILIKE'),
        expect.stringContaining("concat_ws(' · '"),
        expect.stringContaining('product.name ='),
        expect.stringContaining('COALESCE(item.variantLabel'),
        'balance.itemId = :itemId',
        'balance.locationId = :locationId',
        'balance.branchId = :branchId',
        'item.productId = :productId',
        expect.stringContaining('balance.quantity >='),
        expect.stringContaining('balance.lastMovementAt >='),
        expect.stringContaining('balance.lastMovementAt <'),
      ]),
    );
  });

  it('preserves the exact flattened CRUD list row shape', async () => {
    const longDescription = 'x'.repeat(170);
    await build([
      {
        id: 'balance-1',
        itemId: 'item-1',
        quantity: 12,
        item: {
          code: 'SKU-1',
          name: 'Áo thun đỏ',
          unit: 'cái',
          description: longDescription,
          variantLabel: 'M · Đỏ',
          category: { name: 'Quần áo' },
          product: { name: 'Áo thun' },
        },
      },
      {
        id: 'balance-2',
        itemId: 'item-2',
        quantity: 0,
        item: undefined,
      },
    ]);

    const result = await handler.execute(
      new SearchInventoryStockBalancesV2Query({}, actor),
    );

    expect(result.data[0]).toEqual({
      id: 'balance-1',
      itemId: 'item-1',
      quantity: 12,
      itemName: 'Áo thun đỏ',
      itemCode: 'SKU-1',
      itemVariants: `Quần áo · cái · ${'x'.repeat(157)}…`,
      productName: 'Áo thun',
      variantLabel: 'M · Đỏ',
    });
    expect(result.data[0]).not.toHaveProperty('item');
    expect(result.data[1]).toEqual({
      id: 'balance-2',
      itemId: 'item-2',
      quantity: 0,
      itemName: '',
      itemCode: '',
      itemVariants: '',
      productName: '',
      variantLabel: '',
    });
  });

  it('falls back to the variant summary only when variantLabel is nullish', async () => {
    await build([
      {
        id: 'balance-1',
        item: {
          code: 'SKU-1',
          name: 'Áo',
          unit: 'cái',
          description: '',
          variantLabel: '',
          category: { name: 'Quần áo' },
        },
      },
      {
        id: 'balance-2',
        item: {
          code: 'SKU-2',
          name: 'Quần',
          unit: 'cái',
          variantLabel: undefined,
          category: { name: 'Quần áo' },
        },
      },
    ]);

    const result = await handler.execute(
      new SearchInventoryStockBalancesV2Query({}, actor),
    );

    expect(result.data[0].variantLabel).toBe('');
    expect(result.data[1].variantLabel).toBe('Quần áo · cái');
  });

  it('returns the paginated { data, total, page, limit } envelope', async () => {
    await build([{ id: 'balance-1', item: undefined }], 8);

    const result = await handler.execute(
      new SearchInventoryStockBalancesV2Query({ page: 3, limit: 5 }, actor),
    );

    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result.total).toBe(8);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
  });
});
