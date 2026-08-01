import * as ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { REVENUE_BY_ITEM_COLUMNS } from './revenue-by-item.columns';
import { RevenueByItemReport } from './reports/revenue-by-item.report';
import { RevenueByItemParamsBuilder } from './revenue-by-item-params.builder';
import { ReportRegistry } from './report-definition';
import {
  dateRangeSubtitle,
  ReportExportService,
} from '../report-core/report-export.service';
import { XlsxStreamWriter } from '../report-core/export/xlsx-stream.writer';

const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

const MISA_HEADER_LABELS = [
  'Mã SKU',
  'Tên hàng hóa',
  'Đơn vị tính',
  'Mã vị trí',
  'Tên vị trí',
  'Số lượng bán',
  'Đơn giá TB',
  'Tiền hàng',
  'Khuyến mại',
  'Điểm KM',
  'Tỷ lệ KM (%)',
  'Doanh thu',
  'Nhóm hàng hóa',
  'Thương hiệu',
];

/**
 * Builds a `RevenueByItemReport` wired to one invoice / one line item, using
 * the same repository-mock shape as `revenue-by-item.report.spec.ts`.
 */
function makeReport() {
  const invoiceQb: any = {
    where: jest.fn(() => invoiceQb),
    andWhere: jest.fn(() => invoiceQb),
    getMany: jest.fn(async () => [
      {
        id: 'i1',
        issuedAt: new Date('2026-06-03T08:30:00Z'),
        code: 'HD000001',
        status: 'paid',
        branchId: 'b1',
      },
    ]),
    getCount: jest.fn(async () => 1),
  };
  const stockBalanceQb: any = {
    innerJoin: jest.fn(() => stockBalanceQb),
    where: jest.fn(() => stockBalanceQb),
    andWhere: jest.fn(() => stockBalanceQb),
    orderBy: jest.fn(() => stockBalanceQb),
    select: jest.fn(() => stockBalanceQb),
    addSelect: jest.fn(() => stockBalanceQb),
    getRawMany: jest.fn(async () => []),
  };
  const repo = (rows?: any[]) => ({ find: jest.fn(async () => rows ?? []) });

  return new RevenueByItemReport(
    { createQueryBuilder: jest.fn(() => invoiceQb) } as any,
    repo([
      {
        invoiceId: 'i1',
        itemId: 'it1',
        itemCode: 'ABA2777',
        itemName: 'Giày nam ABA2777',
        unit: 'Đôi',
        quantity: 3,
        unitPrice: 750000,
        lineDiscount: 0,
        lineTotal: 2250000,
        direction: 'OUT',
      },
    ]) as any,
    repo([{ id: 'it1', categoryId: 'cat1', brand: 'Giày MT' }]) as any,
    repo([{ id: 'cat1', name: 'Giày nam' }]) as any,
    repo([]) as any,
    repo([{ id: 'wh1', branchId: 'b1', isMainStorage: false, isActive: true }]) as any,
    repo([{ id: 'loc1', code: 'A-01', name: 'Kệ A1' }]) as any,
    repo([{ itemId: 'it1', storageId: 'wh1', locationId: 'loc1' }]) as any,
    { ...repo([]), createQueryBuilder: jest.fn(() => stockBalanceQb) } as any,
    { hasPermission: jest.fn(async () => false) } as any,
  );
}

function makeParamsBuilder() {
  const branches = {
    findOne: jest.fn(async () => ({ name: 'Chi nhánh 211 TP. Đà Nẵng' })),
  };
  const categories = { findOne: jest.fn(async () => null) };
  return new RevenueByItemParamsBuilder(branches as any, categories as any);
}

function makeExportService() {
  const branchRepo = {
    findOne: jest.fn(async () => ({
      name: 'Hồ Chí Minh',
      address: '123 Hồ Chí Minh',
      phone: '0987655555',
    })),
  };
  return new ReportExportService(branchRepo as any);
}

async function writeAndRead(
  header: { title: string; branch: unknown; subtitleLines: string[] },
  columns: unknown[],
  rows: unknown[],
  totals: Record<string, unknown> | null,
): Promise<ExcelJS.Worksheet> {
  const target = new PassThrough();
  const chunks: Buffer[] = [];
  target.on('data', (chunk: Buffer) => chunks.push(chunk));
  const closed = new Promise<void>((resolve) => target.on('end', () => resolve()));

  const writer = new XlsxStreamWriter('Báo cáo');
  await writer.begin(target, header as any, columns as any);
  await writer.rows(rows as any);
  await writer.end(totals as any);
  await closed;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

describe('revenue-by-item end-to-end export (catalog → payload → workbook)', () => {
  // AC-01, AC-04, AC-08, AC-12 in one pass — reads back a workbook produced by
  // the SAME path as the real /reports/invoices/export route: catalog →
  // resolveColumns → XlsxStreamWriter, with subtitleLines composed the same
  // way GetInvoiceReportDocumentHandler.execute does after T-04-02.
  it('produces the 14-column MISA header, formula notation, and the parameter line', async () => {
    const registry = new ReportRegistry([makeReport() as any]);
    const exportService = makeExportService();
    const paramsBuilder = makeParamsBuilder();

    const dto = {
      reportType: 'revenue-by-item',
      columns: REVENUE_BY_ITEM_COLUMNS.map((c) => c.key),
      filters: { issuedAt: { from: '2026-01-01', to: '2026-12-31' } },
    };

    const subtitleLines = [
      ...dateRangeSubtitle(dto.filters.issuedAt),
      ...(await paramsBuilder.build(dto.filters as any, actor)),
    ];

    const prepared = await exportService.prepareExport(registry as any, dto as any, actor, {
      title: 'DOANH THU THEO MẶT HÀNG',
      subtitleLines,
    });

    const rows: Record<string, unknown>[] = [];
    const totals = await prepared.fetcher.drain(async (batch) => {
      rows.push(...(batch as Record<string, unknown>[]));
    });

    const sheet = await writeAndRead(prepared.header, prepared.columns, rows, totals);

    // Layout: branch name/address/phone (3) + title (1) + 2 subtitle lines +
    // 1 blank separator = 7 rows above the header.
    //
    // AC-36 (2026-08-01) added the band row: five consecutive columns here carry
    // the "Doanh thu" band, so the header is now two rows — band on 8, labels on
    // 9. That is a deliberate departure from the flat 14-cell header of the MISA
    // reference, taken so the exported file matches the two-tier header the user
    // sees on screen. Akenzy chose this over keeping MISA parity, 2026-08-01.
    const BAND_ROW = 8;
    const HEADER_ROW = 9;
    const DATA_ROW = HEADER_ROW + 1;
    const TOTALS_ROW = DATA_ROW + 1;

    // AC-36: the band spans exactly the five revenue columns, H..L.
    expect(sheet.getCell(`H${BAND_ROW}`).value).toBe('Doanh thu');
    expect(
      ((sheet.model as unknown as { merges?: string[] }).merges ?? []),
    ).toContain(`H${BAND_ROW}:L${BAND_ROW}`);

    // AC-01: still 14 columns in MISA order — the band adds a row, not a column.
    const headerRow = sheet.getRow(HEADER_ROW);
    const headerValues = (headerRow.values as unknown[]).slice(1) as string[];
    expect(headerValues.length).toBe(14);
    for (const [i, expected] of MISA_HEADER_LABELS.entries()) {
      expect(headerValues[i].split('\n')[0]).toBe(expected);
    }

    // AC-04 / AC-08: formula notation on the 2nd line of the measure columns' cells.
    expect(sheet.getCell(`G${HEADER_ROW}`).value).toBe('Đơn giá TB\n(2)=(3)/(1)');
    expect(sheet.getCell(`L${HEADER_ROW}`).value).toBe('Doanh thu\n(6)=(3)-(4)-(9)');
    // Unbanded columns merge down through both rows, so A9 echoes A8's master.
    expect(sheet.getCell(`A${HEADER_ROW}`).value).toBe('Mã SKU');
    expect(sheet.getCell(`A${HEADER_ROW}`).value as string).not.toContain('\n');

    // AC-12: date line, then the 6-part MISA parameter line, no ": False".
    expect(sheet.getCell('A5').value).toBe(
      'Từ ngày: 01/01/2026 Đến ngày: 31/12/2026',
    );
    const paramLine = sheet.getCell('A6').value as string;
    expect(paramLine).toMatch(/^Xem theo cửa hàng: /);
    expect(paramLine).toContain('Xem theo cửa hàng: Chi nhánh 211 TP. Đà Nẵng');
    expect(paramLine).toContain('Nhóm hàng hóa: Tất cả nhóm');
    expect(paramLine).toContain('Thống kê theo: Hàng hóa');
    expect(paramLine).toContain('Thống kê theo chi nhánh: Không');
    expect(paramLine).toContain('Loại hàng hóa: Hàng hóa');
    expect(paramLine).toContain('Thương hiệu: Tất cả');
    expect(paramLine).not.toContain(': False');

    // Footer totals: averages/percent are null, sums are numbers.
    const totalsRow = sheet.getRow(TOTALS_ROW);
    expect(totalsRow.getCell(7).value).toBeNull(); // unitPrice (G) — average, no sum
    expect(totalsRow.getCell(11).value).toBeNull(); // promoRate (K) — percent, no sum
    expect(totalsRow.getCell(6).value).toBe(3); // quantity (F)
    expect(totalsRow.getCell(12).value).toBe(2250000); // revenue.total (L)
  });
});
