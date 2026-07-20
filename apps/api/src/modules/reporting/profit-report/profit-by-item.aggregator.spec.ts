import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import {
  aggregateProfitByItem,
  buildItemGroupTotals,
  itemGroupCellValue,
  ProfitByItemRowInput,
} from './profit-by-item.aggregator';

const row = (over: Partial<ProfitByItemRowInput> = {}): ProfitByItemRowInput => ({
  itemId: 'it1',
  itemCode: 'SKU1',
  itemName: 'Item 1',
  parentId: null,
  parentSku: null,
  parentName: null,
  categoryId: 'cat1',
  categoryCode: 'CAT1',
  categoryName: 'Category 1',
  unit: 'pcs',
  location: null,
  direction: ItemDirection.OUT,
  quantity: 2,
  lineTotal: 2000,
  costPrice: 500,
  ...over,
});

describe('aggregateProfitByItem', () => {
  it('sums revenue and costOfGoods for a plain SALE line', () => {
    const [g] = aggregateProfitByItem([row()], 'item');
    expect(g).toMatchObject({ quantity: 2, revenue: 2000, costOfGoods: 1000 });
    expect(itemGroupCellValue('grossProfit', g)).toBe(1000);
    expect(itemGroupCellValue('marginOnRevenue', g)).toBe(50);
    expect(itemGroupCellValue('marginOnCost', g)).toBe(100);
  });

  it('nets an EXCHANGE invoice with both OUT and IN lines for the same item', () => {
    const rows = [
      row({ direction: ItemDirection.OUT, quantity: 3, lineTotal: 3000, costPrice: 500 }),
      row({ direction: ItemDirection.IN, quantity: 1, lineTotal: 1000, costPrice: 500 }),
    ];
    const [g] = aggregateProfitByItem(rows, 'item');
    // net qty 2, net revenue 2000, net cost 500*3 - 500*1 = 1000
    expect(g).toMatchObject({ quantity: 2, revenue: 2000, costOfGoods: 1000 });
  });

  it('produces a negative costOfGoods when the returned line costs more than it sold for', () => {
    // OUT: qty 5 @ lineTotal 5000, costPrice 100 -> revenue +5000, cost +500.
    // IN (return): qty 2, lineTotal 0 (heavily discounted sale), costPrice 3000 -> revenue -0, cost -6000.
    // Net: revenue stays positive (5000) while costOfGoods goes negative (500 - 6000 = -5500).
    const rows = [
      row({ direction: ItemDirection.OUT, quantity: 5, lineTotal: 5000, costPrice: 100 }),
      row({ direction: ItemDirection.IN, quantity: 2, lineTotal: 0, costPrice: 3000 }),
    ];
    const [g] = aggregateProfitByItem(rows, 'item');
    expect(g.revenue).toBe(5000);
    expect(g.costOfGoods).toBe(-5500);
    // grossProfit and margins still compute (no throw), not clamped to 0.
    expect(itemGroupCellValue('grossProfit', g)).toBe(10500);
    expect(itemGroupCellValue('marginOnCost', g)).toBeCloseTo(-190.91, 1);
  });

  it('returns null profitPerUnit/margins when the denominator is 0', () => {
    const g = aggregateProfitByItem(
      [row({ direction: ItemDirection.OUT, quantity: 0, lineTotal: 0, costPrice: 0 })],
      'item',
    )[0];
    expect(itemGroupCellValue('profitPerUnit', g)).toBeNull();
    expect(itemGroupCellValue('marginOnRevenue', g)).toBeNull();
    expect(itemGroupCellValue('marginOnCost', g)).toBeNull();
  });

  it('groups by parent product (grain=parent), falling back to item grain when no parent', () => {
    const rows = [
      row({ itemId: 'v1', parentId: 'p1', parentSku: 'PARENT', parentName: 'Parent', quantity: 1, lineTotal: 1000, costPrice: 400 }),
      row({ itemId: 'v2', parentId: 'p1', parentSku: 'PARENT', parentName: 'Parent', quantity: 2, lineTotal: 2000, costPrice: 400 }),
      row({ itemId: 'v3', parentId: null, itemCode: 'STANDALONE', quantity: 1, lineTotal: 500, costPrice: 100 }),
    ];
    const groups = aggregateProfitByItem(rows, 'parent');
    expect(groups).toHaveLength(2);
    const parentGroup = groups.find((g) => g.skuCode === 'PARENT');
    expect(parentGroup).toMatchObject({ quantity: 3, revenue: 3000, costOfGoods: 1200 });
  });

  it('carries location through at item grain, but never at parent/group grain', () => {
    const withLocation = row({ location: 'A-01-03' });
    expect(itemGroupCellValue('location', aggregateProfitByItem([withLocation], 'item')[0])).toBe(
      'A-01-03',
    );
    expect(
      itemGroupCellValue(
        'location',
        aggregateProfitByItem([{ ...withLocation, parentId: 'p1', parentSku: 'PARENT' }], 'parent')[0],
      ),
    ).toBeNull();
    expect(
      itemGroupCellValue('location', aggregateProfitByItem([withLocation], 'group')[0]),
    ).toBeNull();
  });

  it('groups by category (grain=group), skipping rows with no category', () => {
    const rows = [
      row({ categoryId: 'cat1', categoryCode: 'CAT1', categoryName: 'Cat 1', quantity: 1, lineTotal: 1000, costPrice: 300 }),
      row({ categoryId: 'cat1', categoryCode: 'CAT1', categoryName: 'Cat 1', quantity: 1, lineTotal: 500, costPrice: 200 }),
      row({ categoryId: null, quantity: 1, lineTotal: 999, costPrice: 999 }),
    ];
    const groups = aggregateProfitByItem(rows, 'group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ categoryCode: 'CAT1', quantity: 2, revenue: 1500, costOfGoods: 500 });
  });
});

describe('buildItemGroupTotals', () => {
  it('recomputes margin ratios from SUMMED totals, not averaged per-row percentages, and blanks profitPerUnit', () => {
    const groups = aggregateProfitByItem(
      [
        row({ itemId: 'a', quantity: 1, lineTotal: 1000, costPrice: 200 }), // margin 400%
        row({ itemId: 'b', quantity: 1, lineTotal: 100, costPrice: 90 }), // margin ~11%
      ],
      'item',
    );
    const totals = buildItemGroupTotals(
      ['quantity', 'revenue', 'costOfGoods', 'grossProfit', 'profitPerUnit', 'marginOnRevenue', 'marginOnCost'],
      groups,
    );
    // revenue=1100, cost=290, grossProfit=810 -> marginOnRevenue = 810/1100*100 = 73.64 (not the average of 400% and 11%)
    expect(totals.revenue).toBe(1100);
    expect(totals.costOfGoods).toBe(290);
    expect(totals.grossProfit).toBe(810);
    expect(totals.marginOnRevenue).toBeCloseTo(73.64, 1);
    expect(totals.profitPerUnit).toBeNull();
  });
});
