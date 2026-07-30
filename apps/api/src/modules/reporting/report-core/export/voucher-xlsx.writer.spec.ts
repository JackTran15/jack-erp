import {
  DocumentColumn,
  ReportColumnDataType,
  VoucherKind,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import * as ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { voucherToReportDocument } from './voucher-export.adapter';
import { VoucherXlsxWriter } from './voucher-xlsx.writer';

/**
 * The reference goods-receipt grid: "Tên hàng hóa" spans C:F, and the two sale
 * columns are present but hidden — so the logical list is 9 columns wide and
 * the sheet is 12:
 *
 *   A stt | B sku | C:F name | G uom | H quantity | I unitPrice | J lineTotal
 *   | K salePrice (hidden) | L saleTotal (hidden)
 */
const COLUMNS: DocumentColumn[] = [
  { col: 'stt', label: 'STT', type: ReportColumnDataType.NUMBER, align: 'center' },
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING, span: 4 },
  { col: 'uom', label: 'ĐVT', type: ReportColumnDataType.STRING },
  { col: 'quantity', label: 'SL', type: ReportColumnDataType.NUMBER },
  { col: 'unitPrice', label: 'Đơn giá', type: ReportColumnDataType.CURRENCY },
  { col: 'lineTotal', label: 'Thành tiền', type: ReportColumnDataType.CURRENCY },
  { col: 'salePrice', label: 'Giá bán', type: ReportColumnDataType.CURRENCY, hidden: true },
  {
    col: 'saleTotal',
    label: 'Thành tiền giá bán',
    type: ReportColumnDataType.CURRENCY,
    hidden: true,
  },
];

/** The same shape without span or hidden — the pre-grid layout, still supported. */
const PLAIN_COLUMNS: DocumentColumn[] = [
  { col: 'stt', label: 'STT', type: ReportColumnDataType.NUMBER, align: 'center' },
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'quantity', label: 'SL', type: ReportColumnDataType.NUMBER },
  { col: 'lineTotal', label: 'Thành tiền', type: ReportColumnDataType.CURRENCY },
];

/** Row map for `payload()` — named so assertions read as layout, not arithmetic. */
const ROW_HEADER = 10;
const ROW_DATA = 11;
const ROW_TOTALS = 12;

function payload(overrides: Partial<VoucherPrintPayload> = {}): VoucherPrintPayload {
  return {
    kind: VoucherKind.GOODS_RECEIPT,
    paper: 'A4',
    title: 'PHIẾU NHẬP KHO',
    docNo: 'NK000383',
    docDate: '28 tháng 7 năm 2026',
    branch: {
      name: 'Chi nhánh 211 TP. Đà Nẵng',
      address: '211 Lê Duẩn, Thanh Khê - Đà Nẵng',
      phone: null,
    },
    info: [
      { label: 'Đối tượng', value: 'CHÂU' },
      { label: 'Người giao', value: 'A VINH' },
    ],
    lineColumns: COLUMNS,
    lines: [
      {
        stt: 1,
        sku: 'TH10520-D-35',
        name: 'Giày nữ TH10520-D-35',
        uom: 'Đôi',
        quantity: 2,
        unitPrice: 250000,
        lineTotal: 500000,
        salePrice: 400000,
        saleTotal: 800000,
      },
    ],
    totals: {
      stt: null,
      sku: null,
      name: null,
      uom: null,
      quantity: 2,
      unitPrice: null,
      lineTotal: 500000,
      salePrice: null,
      saleTotal: 800000,
    },
    amountInWords: 'Năm trăm nghìn đồng chẵn.',
    signatures: [
      'Người lập phiếu',
      'Người nhận hàng',
      'Thủ kho',
      'Kế toán trưởng',
      'Giám đốc',
    ],
    ...overrides,
  };
}

/** Drive the writer through the real pipeline shape and read the bytes back. */
async function writeAndRead(
  voucher: VoucherPrintPayload,
): Promise<ExcelJS.Worksheet> {
  const doc = voucherToReportDocument(voucher);
  const target = new PassThrough();
  const chunks: Buffer[] = [];
  target.on('data', (chunk: Buffer) => chunks.push(chunk));
  const closed = new Promise<void>((resolve) => target.on('end', () => resolve()));

  const writer = new VoucherXlsxWriter(voucher);
  await writer.begin(target, doc.header, doc.columns);
  await writer.rows(doc.rows);
  await writer.end(doc.totals);
  await closed;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
  return workbook.worksheets[0];
}

/** Every non-empty value in column A, top to bottom — the document's spine. */
function columnAText(sheet: ExcelJS.Worksheet): string[] {
  const values: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const value = row.getCell(1).value;
    if (typeof value === 'string' && value.trim()) values.push(value);
  });
  return values;
}

describe('VoucherXlsxWriter', () => {
  it('names the sheet after the document type, not its number', async () => {
    const sheet = await writeAndRead(payload());

    // Sentence case on the tab, upper case on the page — as in the reference.
    expect(sheet.name).toBe('Phiếu nhập kho');
  });

  it('writes title, date and number as three separate centred lines', async () => {
    const sheet = await writeAndRead(payload());

    expect(sheet.getCell('A1').value).toBe('Chi nhánh 211 TP. Đà Nẵng');
    expect(sheet.getCell('A2').value).toBe('211 Lê Duẩn, Thanh Khê - Đà Nẵng');
    expect(sheet.getCell('A4').value).toBe('PHIẾU NHẬP KHO');
    expect(sheet.getCell('A5').value).toBe('Ngày 28 tháng 7 năm 2026');
    expect(sheet.getCell('A6').value).toBe('Số: NK000383');

    for (const ref of ['A4', 'A5', 'A6']) {
      expect(sheet.getCell(ref).alignment?.horizontal).toBe('center');
    }
    expect(sheet.getCell('A4').font?.size).toBe(18);
    expect(sheet.getCell('A5').font?.italic).toBe(true);
  });

  it('says "Ngày" exactly once', async () => {
    const sheet = await writeAndRead(payload());

    expect(sheet.getCell('A5').value).not.toContain('Ngày Ngày');
  });

  it('writes each info row bold and left-aligned on its own line', async () => {
    const sheet = await writeAndRead(payload());

    expect(sheet.getCell('A7').value).toBe('Đối tượng: CHÂU');
    expect(sheet.getCell('A8').value).toBe('Người giao: A VINH');
    expect(sheet.getCell('A7').font?.bold).toBe(true);
    expect(sheet.getCell('A7').alignment?.horizontal).toBe('left');
  });

  it('borders the column header without filling it', async () => {
    const sheet = await writeAndRead(payload());
    const cell = sheet.getCell(`A${ROW_HEADER}`);

    expect(cell.value).toBe('STT');
    expect(cell.font?.bold).toBe(true);
    expect(cell.border?.top?.style).toBe('thin');
    // ExcelJS reads an unfilled cell back as a "none" pattern, not as undefined.
    expect((cell.fill as ExcelJS.FillPattern)?.pattern).toBe('none');
    expect((cell.fill as ExcelJS.FillPattern)?.fgColor).toBeUndefined();
  });

  describe('column grid', () => {
    it('merges a spanned column across C:F on the header and on every data row', async () => {
      const sheet = await writeAndRead(payload());

      expect(sheet.getCell(`C${ROW_HEADER}`).value).toBe('Tên hàng hóa');
      expect(sheet.getCell(`F${ROW_HEADER}`).master.address).toBe(`C${ROW_HEADER}`);

      expect(sheet.getCell(`C${ROW_DATA}`).value).toBe('Giày nữ TH10520-D-35');
      expect(sheet.getCell(`F${ROW_DATA}`).master.address).toBe(`C${ROW_DATA}`);
    });

    it('places the columns after a span at their shifted grid positions', async () => {
      const sheet = await writeAndRead(payload());

      expect(sheet.getCell(`G${ROW_HEADER}`).value).toBe('ĐVT');
      expect(sheet.getCell(`H${ROW_HEADER}`).value).toBe('SL');
      expect(sheet.getCell(`I${ROW_HEADER}`).value).toBe('Đơn giá');
      expect(sheet.getCell(`J${ROW_HEADER}`).value).toBe('Thành tiền');
      expect(sheet.getCell(`G${ROW_DATA}`).value).toBe('Đôi');
      expect(sheet.getCell(`J${ROW_DATA}`).value).toBe(500000);
    });

    it('writes hidden columns into the sheet but hides them', async () => {
      const sheet = await writeAndRead(payload());

      expect(sheet.getCell(`K${ROW_HEADER}`).value).toBe('Giá bán');
      expect(sheet.getCell(`L${ROW_HEADER}`).value).toBe('Thành tiền giá bán');
      // The value is there for whoever unhides the column.
      expect(sheet.getCell(`K${ROW_DATA}`).value).toBe(400000);
      expect(sheet.getCell(`L${ROW_DATA}`).value).toBe(800000);

      expect(sheet.getColumn(11).hidden).toBe(true);
      expect(sheet.getColumn(12).hidden).toBe(true);
      expect(sheet.getColumn(10).hidden).toBeFalsy();
    });

    it('keeps the totals figures under their own columns despite the span', async () => {
      const sheet = await writeAndRead(payload());

      expect(sheet.getCell(`A${ROW_TOTALS}`).value).toBe('Tổng');
      expect(sheet.getCell(`H${ROW_TOTALS}`).value).toBe(2);
      expect(sheet.getCell(`J${ROW_TOTALS}`).value).toBe(500000);
      expect(sheet.getCell(`L${ROW_TOTALS}`).value).toBe(800000);
      expect(sheet.getCell(`J${ROW_TOTALS}`).font?.bold).toBe(true);
    });

    it('lays out a table with no span or hidden exactly as before', async () => {
      const sheet = await writeAndRead(
        payload({
          lineColumns: PLAIN_COLUMNS,
          lines: [{ stt: 1, sku: 'X', quantity: 2, lineTotal: 500000 }],
          totals: { stt: null, sku: null, quantity: 2, lineTotal: 500000 },
        }),
      );

      expect(sheet.getRow(ROW_HEADER).values).toEqual([
        undefined,
        'STT',
        'Mã SKU',
        'SL',
        'Thành tiền',
      ]);
      expect(sheet.getCell(`D${ROW_DATA}`).value).toBe(500000);
      expect(sheet.getCell(`B${ROW_HEADER}`).isMerged).toBe(false);
    });
  });

  it('uses the label the payload asks for', async () => {
    const sheet = await writeAndRead(payload({ totalsLabel: 'Cộng' }));

    expect(sheet.getCell(`A${ROW_TOTALS}`).value).toBe('Cộng');
  });

  it('writes the amount in words when the voucher carries money', async () => {
    const sheet = await writeAndRead(payload());

    expect(columnAText(sheet)).toContain(
      'Số tiền viết bằng chữ: Năm trăm nghìn đồng chẵn.',
    );
  });

  it('omits the amount-in-words line when there is no money on the voucher', async () => {
    const sheet = await writeAndRead(payload({ amountInWords: undefined }));

    expect(
      columnAText(sheet).some((line) => line.startsWith('Số tiền viết bằng chữ')),
    ).toBe(false);
  });

  it('writes the signing date line right-aligned', async () => {
    const sheet = await writeAndRead(payload());
    const line = 'Ngày.......tháng.......năm............';
    const row = sheet.getRow(sheet.rowCount - 2);

    expect(row.getCell(1).value).toBe(line);
    expect(row.getCell(1).alignment?.horizontal).toBe('right');
  });

  describe('signature block', () => {
    it('starts at column B and steps one column between boxes', async () => {
      const sheet = await writeAndRead(payload());
      const labels = sheet.getRow(sheet.rowCount - 1);
      const hints = sheet.getRow(sheet.rowCount);

      expect(labels.getCell(1).value).toBeNull();
      expect(labels.getCell(2).value).toBe('Người lập phiếu');
      expect(labels.getCell(4).value).toBe('Người nhận hàng');
      expect(labels.getCell(6).value).toBe('Thủ kho');
      expect(labels.getCell(8).value).toBe('Kế toán trưởng');
      expect(labels.getCell(10).value).toBe('Giám đốc');

      for (const column of [2, 4, 6, 8, 10]) {
        expect(hints.getCell(column).value).toBe('(Ký, họ tên)');
      }
    });

    it('never drops a signature, even when the table is narrower than the block', async () => {
      const sheet = await writeAndRead(
        payload({
          lineColumns: PLAIN_COLUMNS,
          lines: [{ stt: 1, sku: 'X', quantity: 2, lineTotal: 1 }],
          totals: { stt: null, sku: null, quantity: 2, lineTotal: 1 },
        }),
      );
      const labels = sheet.getRow(sheet.rowCount - 1);

      const written: string[] = [];
      labels.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value) written.push(String(cell.value));
      });
      // 5 boxes will not fit one-per-column in a 4-column table, so the block
      // runs past the table rather than rounding two onto the same cell.
      expect(written).toEqual([
        'Người lập phiếu',
        'Người nhận hàng',
        'Thủ kho',
        'Kế toán trưởng',
        'Giám đốc',
      ]);
    });

    it('spreads the boxes when the table is wide enough but the pitch is not', async () => {
      const sheet = await writeAndRead(
        payload({
          lineColumns: PLAIN_COLUMNS,
          lines: [{ stt: 1, sku: 'X', quantity: 2, lineTotal: 1 }],
          totals: { stt: null, sku: null, quantity: 2, lineTotal: 1 },
          signatures: ['Người lập phiếu', 'Thủ kho', 'Giám đốc'],
        }),
      );
      const labels = sheet.getRow(sheet.rowCount - 1);

      const written: number[] = [];
      labels.eachCell({ includeEmpty: false }, (cell, column) => {
        if (cell.value) written.push(column);
      });
      // B/D/F would need 6 columns; 3 boxes still fit one-per-column in 4.
      expect(written).toEqual([1, 3, 4]);
    });

    it('keeps the signature block out of the table border', async () => {
      const sheet = await writeAndRead(payload());
      const labels = sheet.getRow(sheet.rowCount - 1);

      expect(labels.getCell(2).border?.top?.style).toBeUndefined();
    });
  });

  it('sets neither an auto-filter nor a frozen pane', async () => {
    const sheet = await writeAndRead(payload());

    expect(sheet.autoFilter).toBeUndefined();
    expect(sheet.views ?? []).not.toContainEqual(
      expect.objectContaining({ state: 'frozen' }),
    );
  });

  it('formats figures as integers and keeps text left', async () => {
    const sheet = await writeAndRead(payload());

    expect(sheet.getCell(`J${ROW_DATA}`).numFmt).toBe('#,##0');
    expect(sheet.getCell(`J${ROW_DATA}`).alignment?.horizontal).toBe('right');
    expect(sheet.getCell(`B${ROW_DATA}`).alignment?.horizontal).toBe('left');
    expect(sheet.getCell(`A${ROW_DATA}`).alignment?.horizontal).toBe('center');
  });
});
