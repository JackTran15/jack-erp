import { ReportGroupBy } from '@erp/shared-interfaces';
import { buildSubtitleLines } from '../../inventory-reports/queries/get-inventory-report-document.handler';
import { debtFilterSummary } from '../debt-report/queries/get-debt-report-document.handler';
import { invoiceFilterSummary } from '../invoice-report/queries/get-invoice-report-document.handler';
import { profitFilterSummary } from '../profit-report/queries/get-profit-report-document.handler';
import {
  dateRangeSubtitle,
  filterSummarySubtitle,
  formatDocumentDate,
} from './report-export.service';

describe('formatDocumentDate', () => {
  it('renders an ISO date as dd/mm/yyyy', () => {
    expect(formatDocumentDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDocumentDate('2026-12-31T17:00:00.000Z')).toBe('31/12/2026');
  });

  it('passes an unrecognised value through rather than dropping it', () => {
    expect(formatDocumentDate('hôm nay')).toBe('hôm nay');
  });
});

describe('dateRangeSubtitle', () => {
  it('renders the period the way the reference workbook does', () => {
    expect(dateRangeSubtitle({ from: '2026-01-01', to: '2026-12-31' })).toEqual([
      'Từ ngày: 01/01/2026 Đến ngày: 31/12/2026',
    ]);
  });

  it('marks a half-open range instead of inventing a bound', () => {
    expect(dateRangeSubtitle({ from: '2026-01-01' })).toEqual([
      'Từ ngày: 01/01/2026 Đến ngày: —',
    ]);
  });

  it('produces no line when nothing was filtered', () => {
    expect(dateRangeSubtitle(undefined)).toEqual([]);
    expect(dateRangeSubtitle({})).toEqual([]);
  });
});

describe('filterSummarySubtitle', () => {
  it('joins the active parts into one line', () => {
    expect(filterSummarySubtitle(['A: 1', null, 'B: 2'])).toEqual(['A: 1; B: 2']);
  });

  it('produces no line when every filter is absent', () => {
    expect(filterSummarySubtitle([null, null])).toEqual([]);
  });
});

describe('invoiceFilterSummary', () => {
  it('names every applied filter and nothing else', () => {
    expect(
      invoiceFilterSummary({
        statBy: ReportGroupBy.ITEM,
        statDateType: 'invoice_date',
        brand: 'Giày MT',
        statisticByBrand: true,
        productType: 'product',
      }),
    ).toEqual([
      'Thống kê theo: Ngày hóa đơn; Nhóm theo: Hàng hóa; ' +
        'Thống kê theo thương hiệu: Có; Loại hàng hóa: Hàng hóa; Thương hiệu: Giày MT',
    ]);
  });

  it('reports an id filter as active without printing the uuid', () => {
    const [line] = invoiceFilterSummary({
      customerId: '5f1b0d6e-0000-4000-8000-000000000001',
    });

    expect(line).toBe('Khách hàng: đã lọc');
    expect(line).not.toContain('5f1b0d6e');
  });

  it('counts a store group and names a chain-wide scope', () => {
    expect(
      invoiceFilterSummary({ store: { scope: 'group', storeIds: ['a', 'b'] } }),
    ).toEqual(['Cửa hàng: 2 cửa hàng được chọn']);
    expect(invoiceFilterSummary({ store: { scope: 'all', storeIds: [] } })).toEqual([
      'Cửa hàng: Toàn hệ thống',
    ]);
  });

  it('produces no line for an unfiltered request', () => {
    expect(invoiceFilterSummary({})).toEqual([]);
    expect(invoiceFilterSummary(undefined)).toEqual([]);
  });
});

describe('debtFilterSummary', () => {
  it('names the grain and the party filters', () => {
    expect(
      debtFilterSummary({
        groupBy: 'productTemplate',
        supplierId: '5f1b0d6e-0000-4000-8000-000000000002',
      }),
    ).toEqual(['Thống kê theo: Hàng hóa; Nhà cung cấp: đã lọc']);
  });

  it('produces no line for an unfiltered request', () => {
    expect(debtFilterSummary({})).toEqual([]);
  });
});

describe('profitFilterSummary', () => {
  it('names the grain and formats the comparison period', () => {
    expect(
      profitFilterSummary({
        statBy: ReportGroupBy.PARENT,
        previousPeriod: { from: '2025-01-01', to: '2025-12-31' },
      }),
    ).toEqual(['Thống kê theo: Hàng hóa; Kỳ so sánh: 01/01/2025 — 31/12/2025']);
  });

  it('produces no line for an unfiltered request', () => {
    expect(profitFilterSummary({})).toEqual([]);
  });
});

describe('buildSubtitleLines (inventory)', () => {
  it('emits the period line then a single filter line', () => {
    expect(
      buildSubtitleLines({
        period: { from: '2026-01-01', to: '2026-01-31' },
        warehouseIds: ['a', 'b', 'c'],
        search: 'giày',
      }),
    ).toEqual([
      'Từ ngày: 01/01/2026 Đến ngày: 31/01/2026',
      'Kho: 3 kho được chọn; Tìm kiếm: giày',
    ]);
  });

  it('falls back to the preset when there is no explicit range', () => {
    expect(buildSubtitleLines({ preset: 'this_month' })).toEqual([
      'Kỳ báo cáo: Tháng này',
    ]);
  });

  it('produces nothing for an unfiltered request', () => {
    expect(buildSubtitleLines({})).toEqual([]);
    expect(buildSubtitleLines(undefined)).toEqual([]);
  });
});
