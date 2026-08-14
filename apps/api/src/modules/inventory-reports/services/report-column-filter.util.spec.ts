import { BadRequestException } from '@nestjs/common';
import {
  CompareOperator,
  StringOperator,
} from '../../../common/filters/filter.dto';
import {
  buildReportColumnFilter,
  type ReportColumnSpecs,
} from './report-column-filter.util';

const SPECS: ReportColumnSpecs = {
  itemCode: { sql: 'i.code', kind: 'text' },
  itemName: { sql: 'i.name', kind: 'text' },
  openingQty: { sql: 'c.opening_qty', kind: 'number' },
  inQty: { sql: 'c.in_qty', kind: 'number' },
};

describe('buildReportColumnFilter', () => {
  it('emits nothing when no filter is active', () => {
    expect(buildReportColumnFilter(undefined, SPECS, 0)).toEqual({
      where: '',
      params: [],
    });
    expect(buildReportColumnFilter({}, SPECS, 0)).toEqual({
      where: '',
      params: [],
    });
  });

  it('ignores a filter whose value is blank', () => {
    const result = buildReportColumnFilter(
      { itemCode: { operator: StringOperator.CONTAINS, value: '   ' } },
      SPECS,
      0,
    );
    expect(result).toEqual({ where: '', params: [] });
  });

  it('numbers compare numerically, not as formatted text', () => {
    const result = buildReportColumnFilter(
      { inQty: { operator: CompareOperator.GTE, value: '10' } },
      SPECS,
      0,
    );
    expect(result.where).toBe('((c.in_qty) >= $1)');
    // Bound as a number: typing 10 must not match "100" the way a LIKE on the
    // formatted string used to.
    expect(result.params).toEqual([10]);
  });

  it('supports a numeric range', () => {
    const result = buildReportColumnFilter(
      { openingQty: { from: 5, to: 20 } },
      SPECS,
      0,
    );
    expect(result.where).toBe('((c.opening_qty) >= $1 AND (c.opening_qty) <= $2)');
    expect(result.params).toEqual([5, 20]);
  });

  it('text contains is case-insensitive', () => {
    const result = buildReportColumnFilter(
      { itemName: { operator: StringOperator.CONTAINS, value: 'Giày' } },
      SPECS,
      0,
    );
    expect(result.where).toBe('(i.name ILIKE $1)');
    expect(result.params).toEqual(['%Giày%']);
  });

  it('treats LIKE wildcards typed by the user as literals', () => {
    const result = buildReportColumnFilter(
      { itemCode: { operator: StringOperator.CONTAINS, value: '100%' } },
      SPECS,
      0,
    );
    expect(result.params).toEqual(['%100\\%%']);
  });

  it('counts a NULL cell as "does not contain"', () => {
    const result = buildReportColumnFilter(
      { itemName: { operator: StringOperator.NOT_CONTAINS, value: 'x' } },
      SPECS,
      0,
    );
    expect(result.where).toBe("(COALESCE(i.name, '') NOT ILIKE $1)");
  });

  it('continues parameter numbering after the caller\'s own placeholders', () => {
    const result = buildReportColumnFilter(
      {
        itemCode: { operator: StringOperator.CONTAINS, value: 'SKU' },
        inQty: { operator: CompareOperator.LTE, value: 5 },
      },
      SPECS,
      // The report query already bound $1..$4.
      4,
    );
    expect(result.where).toBe('(i.code ILIKE $5) AND ((c.in_qty) <= $6)');
    expect(result.params).toEqual(['%SKU%', 5]);
  });

  it('rejects a column the report cannot filter rather than returning everything', () => {
    // Silently dropping it would render a filtered-looking grid over unfiltered
    // rows — and a footer total to match.
    expect(() =>
      buildReportColumnFilter(
        { notAColumn: { operator: StringOperator.CONTAINS, value: 'x' } },
        SPECS,
        0,
      ),
    ).toThrow(BadRequestException);
  });
});
