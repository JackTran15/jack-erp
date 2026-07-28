import { DocumentColumn, ReportColumnDataType } from '@erp/shared-interfaces';
import * as ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { GENERATED_XLSX_FONT_NAME } from '../../../../common/utils/excel-workbook-font.util';
import { ExportDocumentHeader } from './export.types';
import { XlsxStreamWriter } from './xlsx-stream.writer';

const COLUMNS: DocumentColumn[] = [
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING },
  { col: 'amount', label: 'Thành tiền', type: ReportColumnDataType.CURRENCY },
];

const HEADER: ExportDocumentHeader = {
  title: 'TỔNG HỢP NHẬP XUẤT TỒN KHO',
  branch: { name: 'Chi nhánh Quận 1', address: '12 Lê Lợi', phone: '0900000000' },
  subtitleLines: ['Từ ngày: 2026-01-01; Đến ngày: 2026-01-31'],
};

/**
 * Drive the writer over a PassThrough and read the bytes back with the normal
 * workbook reader — the assertions are about the file, not about the calls.
 */
async function writeAndRead(
  header: ExportDocumentHeader,
  columns: DocumentColumn[],
  rows: Record<string, string | number | null>[],
  totals: Record<string, string | number | null> | null = null,
  sheetName?: string,
): Promise<ExcelJS.Worksheet> {
  const target = new PassThrough();
  const chunks: Buffer[] = [];
  target.on('data', (chunk: Buffer) => chunks.push(chunk));
  const closed = new Promise<void>((resolve) => target.on('end', () => resolve()));

  const writer = new XlsxStreamWriter(sheetName);
  await writer.begin(target, header, columns);
  await writer.rows(rows);
  await writer.end(totals);
  await closed;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

describe('XlsxStreamWriter', () => {
  it('writes the branch block, title, subtitle, header and rows in order', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 150000 },
      { sku: 'SKU-2', name: 'Giày B', amount: 250000 },
    ]);

    expect(sheet.getCell('A1').value).toBe('Chi nhánh Quận 1');
    expect(sheet.getCell('A2').value).toBe('12 Lê Lợi');
    expect(sheet.getCell('A3').value).toBe('SĐT: 0900000000');
    expect(sheet.getCell('A4').value).toBe('TỔNG HỢP NHẬP XUẤT TỒN KHO');
    expect(sheet.getCell('A5').value).toBe(
      'Từ ngày: 2026-01-01; Đến ngày: 2026-01-31',
    );
    expect(sheet.getRow(6).values).toEqual([
      undefined,
      'Mã SKU',
      'Tên hàng hóa',
      'Thành tiền',
    ]);
    expect(sheet.getRow(7).values).toEqual([
      undefined,
      'SKU-1',
      'Giày A',
      150000,
    ]);
    expect(sheet.getRow(8).values).toEqual([
      undefined,
      'SKU-2',
      'Giày B',
      250000,
    ]);
  });

  it('uses the user-facing column labels as header text', async () => {
    const renamed: DocumentColumn[] = [
      { col: 'amount', label: 'SL tồn cuối', type: ReportColumnDataType.NUMBER },
    ];
    const sheet = await writeAndRead(HEADER, renamed, [{ amount: 1 }]);

    expect(sheet.getCell('A6').value).toBe('SL tồn cuối');
  });

  it('collapses the branch block instead of leaving blank rows', async () => {
    const sheet = await writeAndRead(
      { title: 'BÁO CÁO', branch: null, subtitleLines: [] },
      COLUMNS,
      [{ sku: 'SKU-1', name: 'Giày A', amount: 1 }],
    );

    expect(sheet.getCell('A1').value).toBe('BÁO CÁO');
    expect(sheet.getRow(2).getCell(1).value).toBe('Mã SKU');
  });

  it('formats number-family columns and leaves string columns alone', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 150000 },
    ]);

    expect(sheet.getCell('C7').numFmt).toBe('#,##0.###');
    expect(sheet.getCell('A7').numFmt).toBeUndefined();
    expect(sheet.getCell('C7').alignment?.horizontal).toBe('right');
    expect(sheet.getCell('A7').alignment?.horizontal).toBe('left');
  });

  it('writes a bold totals row last when there is one', async () => {
    const sheet = await writeAndRead(
      HEADER,
      COLUMNS,
      [{ sku: 'SKU-1', name: 'Giày A', amount: 150000 }],
      { sku: null, name: null, amount: 150000 },
    );

    expect(sheet.getRow(8).getCell(3).value).toBe(150000);
    expect(sheet.getRow(8).getCell(3).font?.bold).toBe(true);
  });

  it('omits the totals row when there is none', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 1 },
    ]);

    expect(sheet.getRow(8).getCell(1).value).toBeNull();
  });

  it('applies the generated-file font to every cell it writes', async () => {
    const sheet = await writeAndRead(
      HEADER,
      COLUMNS,
      [{ sku: 'SKU-1', name: 'Giày A', amount: 1 }],
      { sku: null, name: null, amount: 1 },
    );

    expect(sheet.getCell('A4').font?.name).toBe(GENERATED_XLSX_FONT_NAME);
    expect(sheet.getCell('A6').font?.name).toBe(GENERATED_XLSX_FONT_NAME);
    expect(sheet.getCell('A7').font?.name).toBe(GENERATED_XLSX_FONT_NAME);
    expect(sheet.getCell('C8').font?.name).toBe(GENERATED_XLSX_FONT_NAME);
  });

  it('freezes the header row and sets the auto-filter over it', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 1 },
    ]);

    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 6 });
    // Written as a {from,to} pair, read back as the A1 range Excel stores.
    expect(sheet.autoFilter).toBe('A6:C6');
  });

  it('sanitises a sheet name Excel would reject', async () => {
    const sheet = await writeAndRead(
      HEADER,
      COLUMNS,
      [{ sku: 'SKU-1', name: 'Giày A', amount: 1 }],
      null,
      'Nhập/Xuất: kho [2026] rất là dài quá ba mươi mốt ký tự',
    );

    expect(sheet.name.length).toBeLessThanOrEqual(31);
    expect(sheet.name).not.toMatch(/[[\]:*?/\\]/);
  });

  it('writes a missing column key as an empty cell rather than failing', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [{ sku: 'SKU-1' }]);

    expect(sheet.getRow(7).getCell(2).value).toBeNull();
    expect(sheet.getRow(7).getCell(1).value).toBe('SKU-1');
  });
});
