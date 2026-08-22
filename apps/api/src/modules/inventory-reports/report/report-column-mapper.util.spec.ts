import { BadRequestException } from '@nestjs/common';
import { ColumnFilter } from '@erp/shared-interfaces';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';
import {
  buildReportColumnFilter,
  type ReportColumnSpecs,
} from '../services/report-column-filter.util';
import { toEngineFilters } from './report-column-mapper.util';

describe('toEngineFilters', () => {
  it('returns an empty map for absent or empty input', () => {
    expect(toEngineFilters(undefined)).toEqual({});
    expect(toEngineFilters([])).toEqual({});
  });

  describe('text operators', () => {
    const cases: Array<[keyof ColumnFilter, StringOperator]> = [
      ['contains', StringOperator.CONTAINS],
      ['equals', StringOperator.EQUALS],
      ['startsWith', StringOperator.STARTS_WITH],
      ['endsWith', StringOperator.ENDS_WITH],
      ['notContains', StringOperator.NOT_CONTAINS],
    ];

    it.each(cases)('maps %s to operator %s', (field, operator) => {
      const filters = [{ col: 'itemName', [field]: 'giày' }] as ColumnFilter[];
      expect(toEngineFilters(filters)).toEqual({
        itemName: { operator, value: 'giày' },
      });
    });
  });

  describe('number operators', () => {
    const cases: Array<[keyof ColumnFilter, CompareOperator]> = [
      ['eq', CompareOperator.EQUALS],
      ['lt', CompareOperator.LT],
      ['lte', CompareOperator.LTE],
      ['gt', CompareOperator.GT],
      ['gte', CompareOperator.GTE],
    ];

    it.each(cases)('maps %s to operator %s', (field, operator) => {
      const filters = [{ col: 'endingQty', [field]: 10 }] as ColumnFilter[];
      expect(toEngineFilters(filters)).toEqual({
        endingQty: { operator, value: 10 },
      });
    });

    it('keeps numeric zero, which is a filter value and not an absent one', () => {
      expect(toEngineFilters([{ col: 'endingQty', eq: 0 }])).toEqual({
        endingQty: { operator: CompareOperator.EQUALS, value: 0 },
      });
    });
  });

  describe('ranges', () => {
    it('folds gte + lte into a from/to range', () => {
      expect(toEngineFilters([{ col: 'endingQty', gte: 10, lte: 20 }])).toEqual({
        endingQty: { from: 10, to: 20 },
      });
    });

    it('passes a from/to pair through untouched', () => {
      expect(
        toEngineFilters([{ col: 'date', from: '2026-08-01', to: '2026-08-31' }]),
      ).toEqual({ date: { from: '2026-08-01', to: '2026-08-31' } });
    });

    it('accepts a lone from or a lone to', () => {
      expect(toEngineFilters([{ col: 'date', from: '2026-08-01' }])).toEqual({
        date: { from: '2026-08-01' },
      });
      expect(toEngineFilters([{ col: 'date', to: '2026-08-31' }])).toEqual({
        date: { to: '2026-08-31' },
      });
    });
  });

  describe('conflicting operators (ADR-02)', () => {
    // The grid emits exactly one operator per column, so these only arrive from
    // a hand-rolled caller — which today gets silently under-filtered rows back.
    it('refuses gt + lt, which has no range representation', () => {
      expect(() => toEngineFilters([{ col: 'endingQty', gt: 5, lt: 10 }])).toThrow(
        BadRequestException,
      );
    });

    it('names the column and every conflicting operator', () => {
      expect(() => toEngineFilters([{ col: 'endingQty', gt: 5, lt: 10 }])).toThrow(
        /endingQty.*gt.*lt/s,
      );
    });

    it('refuses two text operators on one column', () => {
      expect(() =>
        toEngineFilters([{ col: 'itemName', contains: 'a', equals: 'b' }]),
      ).toThrow(BadRequestException);
    });

    it('refuses a text operator mixed with a range end', () => {
      expect(() =>
        toEngineFilters([{ col: 'itemName', contains: 'a', from: 'b' }]),
      ).toThrow(BadRequestException);
    });
  });

  describe('key mapping (ADR-03)', () => {
    it('renames a column to the field its engine knows', () => {
      const keyMap = { name: 'itemName', endingQty: 'closingQty' };
      expect(
        toEngineFilters(
          [
            { col: 'name', contains: 'giày' },
            { col: 'endingQty', gte: 1 },
          ],
          keyMap,
        ),
      ).toEqual({
        itemName: { operator: StringOperator.CONTAINS, value: 'giày' },
        closingQty: { operator: CompareOperator.GTE, value: 1 },
      });
    });

    it('leaves a key absent from the map untouched', () => {
      expect(
        toEngineFilters([{ col: 'sku', contains: 'ABA' }], { name: 'itemName' }),
      ).toEqual({ sku: { operator: StringOperator.CONTAINS, value: 'ABA' } });
    });
  });

  describe('empty filters', () => {
    // A blank filter box must not reach buildReportColumnFilter: that rejects
    // any key it has no spec for, so forwarding it turns a blank box into a 400.
    it('drops a column whose filter carries no operator', () => {
      expect(toEngineFilters([{ col: 'supplier' }])).toEqual({});
    });

    it('drops empty-string operator values', () => {
      expect(toEngineFilters([{ col: 'itemName', contains: '' }])).toEqual({});
    });
  });

  describe('round trip into SQL', () => {
    // The point of the adapter is that its output compiles. Asserting on the
    // intermediate shape alone would pass even if the engine rejected it.
    const SPECS: ReportColumnSpecs = {
      itemName: { sql: 'i.name', kind: 'text' },
      closingQty: { sql: '(c.opening_qty + c.in_qty - c.out_qty)', kind: 'number' },
    };

    it('produces a text predicate the engine compiles', () => {
      const engineFilters = toEngineFilters([{ col: 'name', contains: 'giày' }], {
        name: 'itemName',
      });
      const fragment = buildReportColumnFilter(engineFilters, SPECS, 8);

      expect(fragment.where).toBe('(i.name ILIKE $9)');
      expect(fragment.params).toEqual(['%giày%']);
    });

    it('produces a BETWEEN on the derived expression the row displays', () => {
      const engineFilters = toEngineFilters(
        [{ col: 'endingQty', gte: 10, lte: 20 }],
        { endingQty: 'closingQty' },
      );
      const fragment = buildReportColumnFilter(engineFilters, SPECS, 8);

      expect(fragment.where).toBe(
        '(((c.opening_qty + c.in_qty - c.out_qty)) >= $9 AND ' +
          '((c.opening_qty + c.in_qty - c.out_qty)) <= $10)',
      );
      expect(fragment.params).toEqual([10, 20]);
    });

    it('rejects a column the report has no SQL expression for (AC-11)', () => {
      const engineFilters = toEngineFilters([{ col: 'supplier', contains: 'Bitis' }]);
      expect(() => buildReportColumnFilter(engineFilters, SPECS, 8)).toThrow(
        /supplier/,
      );
    });
  });

  describe('filter-bar scope (ADR-06)', () => {
    it('folds unit and brand in as exact matches', () => {
      expect(toEngineFilters([], {}, { unit: 'Đôi', brand: 'Bitis' })).toEqual({
        unit: { operator: StringOperator.EQUALS, value: 'Đôi' },
        brand: { operator: StringOperator.EQUALS, value: 'Bitis' },
      });
    });

    it('ignores an unselected dropdown', () => {
      expect(toEngineFilters([], {}, { unit: undefined, brand: '' })).toEqual({});
    });

    it('routes the scope value through the key map too', () => {
      expect(toEngineFilters([], { unit: 'itemUnit' }, { unit: 'Đôi' })).toEqual({
        itemUnit: { operator: StringOperator.EQUALS, value: 'Đôi' },
      });
    });

    it('keeps both predicates when bar and grid constrain one column', () => {
      // The in-memory path ran both filters in sequence, so both held. Dropping
      // either one here would return rows the user did not ask for, while the
      // UI still shows both filters as active.
      const result = toEngineFilters(
        [{ col: 'unit', contains: 'ô' }],
        {},
        { unit: 'Đôi' },
      );

      expect(result).toEqual({
        unit: [
          { operator: StringOperator.CONTAINS, value: 'ô' },
          { operator: StringOperator.EQUALS, value: 'Đôi' },
        ],
      });
    });

    it('AND-s both predicates in the compiled SQL', () => {
      const SPECS: ReportColumnSpecs = { unit: { sql: 'i.unit', kind: 'text' } };
      const engineFilters = toEngineFilters(
        [{ col: 'unit', contains: 'ô' }],
        {},
        { unit: 'Đôi' },
      );

      const fragment = buildReportColumnFilter(engineFilters, SPECS, 0);

      expect(fragment.where).toBe(
        '(i.unit ILIKE $1) AND (LOWER(i.unit) = LOWER($2))',
      );
      expect(fragment.params).toEqual(['%ô%', 'Đôi']);
    });
  });
});
