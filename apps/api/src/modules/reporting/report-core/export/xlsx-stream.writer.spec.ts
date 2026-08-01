import { DocumentColumn, ReportColumnDataType } from '@erp/shared-interfaces';
import * as ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { GENERATED_XLSX_FONT_NAME } from '../../../../common/utils/excel-workbook-font.util';
import { ExportDocumentHeader } from './export.types';
import { HEADER_FILL_ARGB } from './xlsx-style';
import { XlsxStreamWriter } from './xlsx-stream.writer';

const COLUMNS: DocumentColumn[] = [
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING },
  { col: 'amount', label: 'Thành tiền', type: ReportColumnDataType.CURRENCY },
];

const HEADER: ExportDocumentHeader = {
  title: 'TỔNG HỢP NHẬP XUẤT TỒN KHO',
  branch: { name: 'Chi nhánh Quận 1', address: '12 Lê Lợi', phone: '0900000000' },
  subtitleLines: ['Từ ngày: 01/01/2026 Đến ngày: 31/01/2026'],
};

/**
 * Row map for `HEADER` — branch name, address, phone, title, one subtitle,
 * blank separator, then the column header. Named so the assertions read as
 * layout rather than arithmetic.
 */
const ROW_HEADER = 7;
const ROW_FIRST_DATA = ROW_HEADER + 1;

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
  it('writes the branch block, title, subtitle, blank row, header and rows in order', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 150000 },
      { sku: 'SKU-2', name: 'Giày B', amount: 250000 },
    ]);

    expect(sheet.getCell('A1').value).toBe('Chi nhánh Quận 1');
    expect(sheet.getCell('A2').value).toBe('12 Lê Lợi');
    // Bare number, no "SĐT:" prefix — matches the reference workbook.
    expect(sheet.getCell('A3').value).toBe('0900000000');
    expect(sheet.getCell('A4').value).toBe('TỔNG HỢP NHẬP XUẤT TỒN KHO');
    expect(sheet.getCell('A5').value).toBe(
      'Từ ngày: 01/01/2026 Đến ngày: 31/01/2026',
    );
    expect(sheet.getCell('A6').value).toBeNull();
    expect(sheet.getRow(ROW_HEADER).values).toEqual([
      undefined,
      'Mã SKU',
      'Tên hàng hóa',
      'Thành tiền',
    ]);
    expect(sheet.getRow(ROW_FIRST_DATA).values).toEqual([
      undefined,
      'SKU-1',
      'Giày A',
      150000,
    ]);
    expect(sheet.getRow(ROW_FIRST_DATA + 1).values).toEqual([
      undefined,
      'SKU-2',
      'Giày B',
      250000,
    ]);
  });

  it('centres the title at the display size and italicises the context lines', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 1 },
    ]);

    expect(sheet.getCell('A4').font?.size).toBe(18);
    expect(sheet.getCell('A4').font?.bold).toBe(true);
    expect(sheet.getCell('A4').alignment?.horizontal).toBe('center');
    expect(sheet.getCell('A5').font?.italic).toBe(true);
    expect(sheet.getCell('A5').alignment?.horizontal).toBe('center');
    // The branch block stays left-aligned.
    expect(sheet.getCell('A1').alignment?.horizontal).toBe('left');
  });

  it('gives the header row the cream fill, dark text and a full border', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 1 },
    ]);

    const cell = sheet.getRow(ROW_HEADER).getCell(1);
    expect((cell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(HEADER_FILL_ARGB);
    expect(cell.font?.bold).toBe(true);
    expect(cell.font?.color?.argb).toBeUndefined();
    expect(cell.border?.top?.style).toBe('thin');
    expect(cell.border?.left?.style).toBe('thin');
    expect(cell.border?.bottom?.style).toBe('thin');
    expect(cell.border?.right?.style).toBe('thin');
    expect(cell.alignment?.wrapText).toBe(true);
  });

  it('borders every data cell', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 150000 },
    ]);

    for (const column of [1, 2, 3]) {
      const cell = sheet.getRow(ROW_FIRST_DATA).getCell(column);
      expect(cell.border?.top?.style).toBe('thin');
      expect(cell.border?.right?.style).toBe('thin');
    }
  });

  it('uses the user-facing column labels as header text', async () => {
    const renamed: DocumentColumn[] = [
      { col: 'amount', label: 'SL tồn cuối', type: ReportColumnDataType.NUMBER },
    ];
    const sheet = await writeAndRead(HEADER, renamed, [{ amount: 1 }]);

    expect(sheet.getCell(`A${ROW_HEADER}`).value).toBe('SL tồn cuối');
  });

  it('collapses the branch block instead of leaving blank rows', async () => {
    const sheet = await writeAndRead(
      { title: 'BÁO CÁO', branch: null, subtitleLines: [] },
      COLUMNS,
      [{ sku: 'SKU-1', name: 'Giày A', amount: 1 }],
    );

    expect(sheet.getCell('A1').value).toBe('BÁO CÁO');
    expect(sheet.getCell('A2').value).toBeNull();
    expect(sheet.getRow(3).getCell(1).value).toBe('Mã SKU');
  });

  it('formats number-family columns as integers and leaves string columns alone', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 150000 },
    ]);

    expect(sheet.getCell(`C${ROW_FIRST_DATA}`).numFmt).toBe('#,##0');
    expect(sheet.getCell(`A${ROW_FIRST_DATA}`).numFmt).toBeUndefined();
    expect(sheet.getCell(`C${ROW_FIRST_DATA}`).alignment?.horizontal).toBe('right');
    expect(sheet.getCell(`A${ROW_FIRST_DATA}`).alignment?.horizontal).toBe('left');
  });

  it('writes a filled, bordered, bold totals row last when there is one', async () => {
    const sheet = await writeAndRead(
      HEADER,
      COLUMNS,
      [{ sku: 'SKU-1', name: 'Giày A', amount: 150000 }],
      { sku: null, name: null, amount: 150000 },
    );

    const cell = sheet.getRow(ROW_FIRST_DATA + 1).getCell(3);
    expect(cell.value).toBe(150000);
    expect(cell.font?.bold).toBe(true);
    expect((cell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(HEADER_FILL_ARGB);
    expect(cell.border?.bottom?.style).toBe('thin');
  });

  it('omits the totals row when there is none', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 1 },
    ]);

    expect(sheet.getRow(ROW_FIRST_DATA + 1).getCell(1).value).toBeNull();
  });

  it('applies the generated-file font to every cell it writes', async () => {
    const sheet = await writeAndRead(
      HEADER,
      COLUMNS,
      [{ sku: 'SKU-1', name: 'Giày A', amount: 1 }],
      { sku: null, name: null, amount: 1 },
    );

    expect(sheet.getCell('A4').font?.name).toBe(GENERATED_XLSX_FONT_NAME);
    expect(sheet.getCell(`A${ROW_HEADER}`).font?.name).toBe(GENERATED_XLSX_FONT_NAME);
    expect(sheet.getCell(`A${ROW_FIRST_DATA}`).font?.name).toBe(
      GENERATED_XLSX_FONT_NAME,
    );
    expect(sheet.getCell(`C${ROW_FIRST_DATA + 1}`).font?.name).toBe(
      GENERATED_XLSX_FONT_NAME,
    );
  });

  it('sets neither an auto-filter nor a frozen pane', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 1 },
    ]);

    expect(sheet.autoFilter).toBeUndefined();
    // A sheet that never declared a view reads back as null, not an empty list.
    expect(sheet.views ?? []).not.toContainEqual(
      expect.objectContaining({ state: 'frozen' }),
    );
  });

  it('sets portrait A4 page setup', async () => {
    const sheet = await writeAndRead(HEADER, COLUMNS, [
      { sku: 'SKU-1', name: 'Giày A', amount: 1 },
    ]);

    expect(sheet.pageSetup.orientation).toBe('portrait');
    expect(sheet.pageSetup.paperSize).toBe(9);
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

    expect(sheet.getRow(ROW_FIRST_DATA).getCell(2).value).toBeNull();
    expect(sheet.getRow(ROW_FIRST_DATA).getCell(1).value).toBe('SKU-1');
  });

  // ADR-05 (revenue-by-item-misa-parity): a column's formula notation goes
  // under its label in the SAME cell, on a second wrapped line.
  describe('header cell formula notation (DocumentColumn.desc)', () => {
    const WITH_DESC: DocumentColumn[] = [
      { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
      {
        col: 'unitPrice',
        label: 'Đơn giá TB',
        type: ReportColumnDataType.CURRENCY,
        desc: '(2)=(3)/(1)',
      },
    ];

    it('puts label and desc on two lines in one cell', async () => {
      const sheet = await writeAndRead(HEADER, WITH_DESC, [
        { sku: 'SKU-1', unitPrice: 1000 },
      ]);

      expect(sheet.getCell(`B${ROW_HEADER}`).value).toBe('Đơn giá TB\n(2)=(3)/(1)');
    });

    it('leaves a column with no desc as a single-line label', async () => {
      const sheet = await writeAndRead(HEADER, WITH_DESC, [
        { sku: 'SKU-1', unitPrice: 1000 },
      ]);

      const cell = sheet.getCell(`A${ROW_HEADER}`);
      expect(cell.value).toBe('Mã SKU');
      expect(cell.value as string).not.toContain('\n');
    });

    it('grows the header row height when any column carries a desc', async () => {
      const sheet = await writeAndRead(HEADER, WITH_DESC, [
        { sku: 'SKU-1', unitPrice: 1000 },
      ]);

      expect(sheet.getRow(ROW_HEADER).height).toBe(45);
    });

    it('keeps the original header row height when no column has a desc', async () => {
      const sheet = await writeAndRead(HEADER, COLUMNS, [
        { sku: 'SKU-1', name: 'Giày A', amount: 1 },
      ]);

      expect(sheet.getRow(ROW_HEADER).height).toBe(30);
    });

    it('keeps the notation when the label was user-renamed', async () => {
      const renamed: DocumentColumn[] = [
        { col: 'unitPrice', label: 'DT thuần', type: ReportColumnDataType.CURRENCY, desc: '(2)=(3)/(1)' },
      ];
      const sheet = await writeAndRead(HEADER, renamed, [{ unitPrice: 1000 }]);

      expect(sheet.getCell(`A${ROW_HEADER}`).value).toBe('DT thuần\n(2)=(3)/(1)');
    });
  });

  describe('column band header (DocumentColumn.group)', () => {
    const BANDED: DocumentColumn[] = [
      { col: 'date', label: 'Ngày', type: ReportColumnDataType.STRING },
      {
        col: 'cash',
        label: 'Tiền mặt',
        type: ReportColumnDataType.CURRENCY,
        group: 'Doanh thu',
      },
      {
        col: 'card',
        label: 'Thẻ',
        type: ReportColumnDataType.CURRENCY,
        group: 'Doanh thu',
      },
      {
        col: 'debt',
        label: 'Công nợ',
        type: ReportColumnDataType.CURRENCY,
        group: 'Khách hàng thanh toán',
      },
    ];

    const ROW_BAND = ROW_HEADER;
    const ROW_LABEL = ROW_HEADER + 1;

    const merges = (sheet: ExcelJS.Worksheet): string[] =>
      // `model.merges` is the serialised <mergeCells> list — the assertion is
      // about what landed in the file, not about which calls were made.
      ((sheet.model as unknown as { merges?: string[] }).merges ?? []).slice().sort();

    it('writes a band row above the label row', async () => {
      const sheet = await writeAndRead(HEADER, BANDED, [
        { date: '01/01', cash: 1, card: 2, debt: 3 },
      ]);

      expect(sheet.getCell(`A${ROW_BAND}`).value).toBe('Ngày');
      expect(sheet.getCell(`B${ROW_BAND}`).value).toBe('Doanh thu');
      expect(sheet.getCell(`D${ROW_BAND}`).value).toBe('Khách hàng thanh toán');

      expect(sheet.getCell(`B${ROW_LABEL}`).value).toBe('Tiền mặt');
      expect(sheet.getCell(`C${ROW_LABEL}`).value).toBe('Thẻ');
      expect(sheet.getCell(`D${ROW_LABEL}`).value).toBe('Công nợ');
    });

    it('reads a merged cell back as its master on both axes', async () => {
      const sheet = await writeAndRead(HEADER, BANDED, [
        { date: '01/01', cash: 1, card: 2, debt: 3 },
      ]);

      // A merged slave echoes its master when the file is read back — it is not
      // an empty cell. That is what proves the two merges took, and it is why
      // the structural assertions below go through the merge ranges instead of
      // looking for blanks.
      expect(sheet.getCell(`C${ROW_BAND}`).value).toBe('Doanh thu');
      expect(sheet.getCell(`A${ROW_LABEL}`).value).toBe('Ngày');
    });

    it('merges a band across exactly the columns that carry it', async () => {
      const sheet = await writeAndRead(HEADER, BANDED, [
        { date: '01/01', cash: 1, card: 2, debt: 3 },
      ]);

      // B..C is the two-column "Doanh thu" run; "Khách hàng thanh toán" is a
      // single column, so it needs no horizontal merge.
      expect(merges(sheet)).toContain(`B${ROW_BAND}:C${ROW_BAND}`);
      expect(merges(sheet)).not.toContain(`D${ROW_BAND}:D${ROW_BAND}`);
    });

    it('merges an unbanded column down through both header rows', async () => {
      const sheet = await writeAndRead(HEADER, BANDED, [
        { date: '01/01', cash: 1, card: 2, debt: 3 },
      ]);

      expect(merges(sheet)).toContain(`A${ROW_BAND}:A${ROW_LABEL}`);
    });

    it('fills and borders every physical cell of both header rows, not just the merge masters', async () => {
      const sheet = await writeAndRead(HEADER, BANDED, [
        { date: '01/01', cash: 1, card: 2, debt: 3 },
      ]);

      for (const row of [ROW_BAND, ROW_LABEL]) {
        for (const col of ['A', 'B', 'C', 'D']) {
          const cell = sheet.getCell(`${col}${row}`);
          expect((cell.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe(
            HEADER_FILL_ARGB,
          );
          expect(cell.border?.bottom?.style).toBe('thin');
        }
      }
    });

    it('pushes the data rows down by one so the totals row still lands under them', async () => {
      const sheet = await writeAndRead(
        HEADER,
        BANDED,
        [{ date: '01/01', cash: 1, card: 2, debt: 3 }],
        { date: 'Tổng', cash: 1, card: 2, debt: 3 },
      );

      expect(sheet.getCell(`A${ROW_LABEL + 1}`).value).toBe('01/01');
      expect(sheet.getCell(`A${ROW_LABEL + 2}`).value).toBe('Tổng');
    });

    it('keeps the formula notation in the label row rather than adding a third row', async () => {
      const banded: DocumentColumn[] = [
        {
          col: 'cash',
          label: 'Tiền mặt',
          type: ReportColumnDataType.CURRENCY,
          group: 'Doanh thu',
          desc: '(7)',
        },
      ];
      const sheet = await writeAndRead(HEADER, banded, [{ cash: 1 }]);

      expect(sheet.getCell(`A${ROW_BAND}`).value).toBe('Doanh thu');
      expect(sheet.getCell(`A${ROW_LABEL}`).value).toBe('Tiền mặt\n(7)');
      expect(sheet.getCell(`A${ROW_LABEL + 1}`).value).toBe(1);
    });

    it('writes a single header row when no column carries a band', async () => {
      // The debt and profit domains emit no bands; their files must not grow a
      // blank row.
      const sheet = await writeAndRead(HEADER, COLUMNS, [
        { sku: 'SKU-1', name: 'Giày A', amount: 1 },
      ]);

      expect(sheet.getRow(ROW_HEADER).values).toEqual([
        undefined,
        'Mã SKU',
        'Tên hàng hóa',
        'Thành tiền',
      ]);
      expect(sheet.getCell(`A${ROW_HEADER + 1}`).value).toBe('SKU-1');
      expect(merges(sheet).filter((m) => m.includes(String(ROW_HEADER)))).toEqual([]);
    });
  });
});
