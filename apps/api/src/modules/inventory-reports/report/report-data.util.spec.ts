import { InventoryReportSearchDto } from '../dto/inventory-report-search.dto';
import {
  searchCacheKey,
  toTotalsRow,
} from './report-data.util';

describe('toTotalsRow', () => {
  const COLUMNS = ['name', 'sku', 'openingQty', 'endingQty'];

  it('fills numeric columns from the engine totals', () => {
    expect(
      toTotalsRow(COLUMNS, { openingQty: 12, closingQty: 30 }, {
        endingQty: 'closingQty',
      }),
    ).toEqual({ name: null, sku: null, openingQty: 12, endingQty: 30 });
  });

  it('keeps the requested column order', () => {
    const row = toTotalsRow(['endingQty', 'openingQty'], {
      openingQty: 1,
      closingQty: 2,
    }, { endingQty: 'closingQty' });

    expect(Object.keys(row!)).toEqual(['endingQty', 'openingQty']);
  });

  it('returns null for a column the engine does not aggregate', () => {
    // Not 0 — zero is a claim about the data, and there is no such claim here.
    expect(toTotalsRow(['name', 'openingQty'], { openingQty: 5 })).toEqual({
      name: null,
      openingQty: 5,
    });
  });

  it('preserves a genuine zero total', () => {
    expect(toTotalsRow(['openingQty'], { openingQty: 0 })).toEqual({
      openingQty: 0,
    });
  });

  it('nulls a non-additive column even when the engine reports one', () => {
    // Average of averages is wrong, so these columns never carry a footer.
    expect(
      toTotalsRow(
        ['outAvgPrice', 'outValue'],
        { outAvgPrice: 99, outValue: 500 },
        {},
        new Set(['outAvgPrice']),
      ),
    ).toEqual({ outAvgPrice: null, outValue: 500 });
  });

  it('returns null when there are no totals, so the footer disappears', () => {
    // Same contract as the buildTotalsRow it replaces: no rows means no footer.
    expect(toTotalsRow(COLUMNS, {})).toBeNull();
    expect(toTotalsRow(COLUMNS, undefined)).toBeNull();
  });

  it('maps a column to itself when the key map has no entry for it', () => {
    expect(toTotalsRow(['openingQty'], { openingQty: 7 }, { name: 'itemName' })).toEqual(
      { openingQty: 7 },
    );
  });
});

describe('v2 report contract', () => {
  // The pushdown work must not change the HTTP surface: if it did, the
  // generated api-client would need regenerating and the web apps would need a
  // matching release. Asserting the DTO shape here makes that promise testable.
  it('keeps the search DTO fields the grid already sends', () => {
    const dto = new InventoryReportSearchDto();
    dto.reportType = 'inventory-stock-summary';
    dto.columns = ['name'];
    dto.page = 2;
    dto.limit = 50;
    dto.columnFilters = [{ col: 'name', contains: 'giày' }];

    // The full accepted surface. A field added or removed here means the
    // generated api-client is stale and the web apps need a matching release.
    expect(Object.keys(dto).sort()).toEqual(
      ['columnFilters', 'columns', 'filters', 'limit', 'page', 'reportType'].sort(),
    );
  });
});

describe('searchCacheKey', () => {
  const ORG = 'org-1';
  const dto = {
    reportType: 'inventory-stock-by-store-pivot',
    columns: ['sku'],
    filters: { preset: 'this_month' },
    page: 1,
    limit: 20,
  } as unknown as InventoryReportSearchDto;

  it('separates two branch scopes in the same organization', () => {
    expect(searchCacheKey(ORG, ['b1', 'b2'], dto)).not.toBe(
      searchCacheKey(ORG, ['b1'], dto),
    );
  });

  it('ignores the order the branch ids arrive in', () => {
    expect(searchCacheKey(ORG, ['b2', 'b1'], dto)).toBe(
      searchCacheKey(ORG, ['b1', 'b2'], dto),
    );
  });

  it('still hits for an identical request from the same scope', () => {
    expect(searchCacheKey(ORG, ['b1'], dto)).toBe(
      searchCacheKey(ORG, ['b1'], dto),
    );
  });

  it('separates two organizations sharing a branch scope', () => {
    expect(searchCacheKey(ORG, ['b1'], dto)).not.toBe(
      searchCacheKey('org-2', ['b1'], dto),
    );
  });

  it('treats an absent scope as its own key, not as a crash', () => {
    expect(searchCacheKey(ORG, undefined, dto)).toBe(
      searchCacheKey(ORG, [], dto),
    );
  });
});
