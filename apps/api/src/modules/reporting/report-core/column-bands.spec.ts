import {
  DocumentColumn,
  ReportColumnDataType,
  buildColumnBands,
  hasColumnBands,
} from '@erp/shared-interfaces';

/**
 * `buildColumnBands` ships in `@erp/shared-interfaces`, which declares
 * `"test": "echo test"` and holds no spec of its own. Its tests live here, with
 * the Jest runner and next to the writer that consumes it.
 */
const column = (col: string, group?: string): DocumentColumn => ({
  col,
  label: col,
  type: ReportColumnDataType.STRING,
  ...(group === undefined ? {} : { group }),
});

describe('buildColumnBands', () => {
  it('gives every column its own bandless segment when none carries a band', () => {
    const columns = [column('date'), column('code'), column('qty')];

    expect(buildColumnBands(columns)).toEqual([
      { label: null, start: 0, span: 1 },
      { label: null, start: 1, span: 1 },
      { label: null, start: 2, span: 1 },
    ]);
    expect(hasColumnBands(columns)).toBe(false);
  });

  it('merges a run of banded columns and leaves the bandless ones alone', () => {
    const columns = [
      column('date'),
      column('cash', 'Doanh thu'),
      column('card', 'Doanh thu'),
      column('note'),
    ];

    expect(buildColumnBands(columns)).toEqual([
      { label: null, start: 0, span: 1 },
      { label: 'Doanh thu', start: 1, span: 2 },
      { label: null, start: 3, span: 1 },
    ]);
    expect(hasColumnBands(columns)).toBe(true);
  });

  it('keeps two different bands side by side apart', () => {
    const columns = [
      column('cash', 'Doanh thu'),
      column('debt', 'Khách hàng thanh toán'),
    ];

    expect(buildColumnBands(columns)).toEqual([
      { label: 'Doanh thu', start: 0, span: 1 },
      { label: 'Khách hàng thanh toán', start: 1, span: 1 },
    ]);
  });

  it('does not merge two runs of the same band separated by a bandless column', () => {
    const columns = [
      column('cash', 'Doanh thu'),
      column('date'),
      column('card', 'Doanh thu'),
    ];

    // Merging across the gap would put `date` under a band it does not belong to.
    expect(buildColumnBands(columns)).toEqual([
      { label: 'Doanh thu', start: 0, span: 1 },
      { label: null, start: 1, span: 1 },
      { label: 'Doanh thu', start: 2, span: 1 },
    ]);
  });

  it('never merges bandless columns with each other', () => {
    const bands = buildColumnBands([column('a'), column('b')]);

    expect(bands).toHaveLength(2);
    expect(bands.every((band) => band.span === 1)).toBe(true);
  });

  it('spans exactly the column count, so bands and columns walk in step', () => {
    const columns = [
      column('date'),
      column('cash', 'Doanh thu'),
      column('card', 'Doanh thu'),
      column('bank', 'Doanh thu'),
      column('debt', 'Công nợ'),
      column('note'),
    ];

    const total = buildColumnBands(columns).reduce((sum, b) => sum + b.span, 0);

    expect(total).toBe(columns.length);
  });

  it('returns nothing for an empty column set', () => {
    expect(buildColumnBands([])).toEqual([]);
    expect(hasColumnBands([])).toBe(false);
  });
});
