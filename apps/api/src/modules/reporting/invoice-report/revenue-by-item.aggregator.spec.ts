import { ReportGroupBy } from '@erp/shared-interfaces';
import {
  aggregateByItem,
  buildItemGroupRow,
  buildItemGroupTotals,
  itemGroupCellValue,
  RevenueByItemRowInput,
} from './revenue-by-item.aggregator';

const row = (over: Partial<RevenueByItemRowInput> = {}): RevenueByItemRowInput => ({
  itemId: 'it1',
  itemCode: 'SKU1',
  itemName: 'Item 1',
  categoryId: 'cat1',
  itemCategory: 'Category 1',
  brand: 'Brand A',
  unit: 'pcs',
  quantity: 2,
  unitPrice: 1000,
  lineDiscount: 100,
  lineTotal: 1900,
  ...over,
});

describe('aggregateByItem', () => {
  it('groups by item and sums measures (goods = Σ qty×unitPrice)', () => {
    const out = aggregateByItem(
      [row(), row({ quantity: 3, lineDiscount: 50, lineTotal: 2950 })],
      ReportGroupBy.ITEM,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      key: 'it1',
      sku: 'SKU1',
      name: 'Item 1',
      unit: 'pcs',
      quantity: 5,
      goods: 5000,
      discount: 150,
      total: 4850,
    });
  });

  it('keeps distinct items separate', () => {
    const out = aggregateByItem(
      [row(), row({ itemId: 'it2', itemCode: 'SKU2', itemName: 'Item 2' })],
      ReportGroupBy.ITEM,
    );
    expect(out.map((g) => g.key).sort()).toEqual(['it1', 'it2']);
  });

  it('groups by category, skipping rows without one', () => {
    const out = aggregateByItem(
      [
        row({ itemId: 'a', categoryId: 'cat1', itemCategory: 'C1' }),
        row({ itemId: 'b', categoryId: 'cat1', itemCategory: 'C1' }),
        row({ itemId: 'c', categoryId: null, itemCategory: null }),
      ],
      ReportGroupBy.GROUP,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'cat1', name: 'C1', sku: null, unit: null, quantity: 4 });
  });

  it('groups by brand, skipping rows without one', () => {
    const out = aggregateByItem(
      [row({ brand: 'Nike' }), row({ itemId: 'x', brand: null })],
      ReportGroupBy.BRAND,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'Nike', name: 'Nike', sku: null });
  });
});

describe('itemGroupCellValue', () => {
  it('computes promoRate = discount / goods %', () => {
    const [g] = aggregateByItem(
      [row({ quantity: 1, unitPrice: 1000, lineDiscount: 100 })],
      ReportGroupBy.ITEM,
    );
    expect(itemGroupCellValue('revenue.promoRate', g)).toBe(10);
    expect(itemGroupCellValue('revenue.promoPoints', g)).toBe(0);
  });

  it('promoRate is 0 when goods is 0', () => {
    const [g] = aggregateByItem(
      [row({ quantity: 0, unitPrice: 0, lineDiscount: 0, lineTotal: 0 })],
      ReportGroupBy.ITEM,
    );
    expect(itemGroupCellValue('revenue.promoRate', g)).toBe(0);
  });
});

describe('buildItemGroupRow / buildItemGroupTotals', () => {
  it('emits the requested columns in order', () => {
    const [g] = aggregateByItem([row()], ReportGroupBy.ITEM);
    const cells = buildItemGroupRow(['sku', 'quantity', 'revenue.total'], g);
    expect(cells.map((c) => c.col)).toEqual(['sku', 'quantity', 'revenue.total']);
    expect(cells[2]).toMatchObject({ col: 'revenue.total', value: 1900 });
  });

  it('sums numeric footer columns and nulls the percent / dimension', () => {
    const groups = aggregateByItem(
      [row(), row({ itemId: 'it2', itemCode: 'SKU2', itemName: 'Z' })],
      ReportGroupBy.ITEM,
    );
    const totals = buildItemGroupTotals(
      ['itemName', 'quantity', 'revenue.total', 'revenue.promoRate'],
      groups,
    );
    const byCol = Object.fromEntries(totals.map((c) => [c.col, c.value]));
    expect(byCol['quantity']).toBe(4);
    expect(byCol['revenue.total']).toBe(3800);
    expect(byCol['itemName']).toBeNull();
    expect(byCol['revenue.promoRate']).toBeNull();
  });
});
