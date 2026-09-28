import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PromotionDiscountMode } from '@erp/shared-interfaces';
import {
  ITEM_DISCOUNT_SHEETS,
  ItemDiscountWorkbookMethod,
  buildItemDiscountWorkbook,
  itemDiscountHeaders,
  normalizeItemDiscountHeader,
  parseItemDiscountWorkbook,
} from './item-discount-workbook';

const S_PERCENT = 'Giảm giá theo %';
const S_AMOUNT = 'Giảm giá theo số tiền';
const S_FIXED = 'Đồng giá';

const METHODS = [
  PromotionDiscountMode.PERCENT,
  PromotionDiscountMode.AMOUNT,
  PromotionDiscountMode.FIXED_PRICE,
] as const;

/** Dựng file từ `{ tên sheet: các hàng }`, giữ thứ tự sheet. */
async function workbookBuffer(sheets: Record<string, ExcelJS.CellValue[][]>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    rows.forEach((values, i) => {
      const row = sheet.getRow(i + 1);
      values.forEach((value, c) => {
        if (value !== undefined) row.getCell(c + 1).value = value;
      });
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function sheetBuffer(rows: ExcelJS.CellValue[][]): Promise<Buffer> {
  return workbookBuffer({ Sheet1: rows });
}

async function parseError(buffer: Buffer, method: ItemDiscountWorkbookMethod) {
  const err = await parseItemDiscountWorkbook(buffer, method).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(BadRequestException);
  return (err as BadRequestException).message;
}

/** Đọc lại mọi sheet: tên + các hàng (đủ số ô tới ô cuối có dữ liệu). */
async function readSheets(buffer: Buffer): Promise<{ name: string; rows: ExcelJS.CellValue[][] }[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets.map((sheet) => {
    const rows: ExcelJS.CellValue[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: ExcelJS.CellValue[] = [];
      for (let c = 1; c <= row.cellCount; c++) values.push(row.getCell(c).value);
      rows.push(values);
    });
    return { name: sheet.name, rows };
  });
}

const PERCENT_HEADERS = ['Mã SKU*', 'Tên hàng hóa', '% giảm giá'];
const AMOUNT_HEADERS = ['Mã SKU*', 'Tên hàng hóa', 'Số tiền giảm'];
const FIXED_HEADERS = ['Mã SKU*', 'Tên hàng hóa'];

/** File mẫu cũ một sheet, 6 cột (feature 2026092701). */
const LEGACY_PERCENT_ROWS: ExcelJS.CellValue[][] = [
  ['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', '% giảm giá', 'Giá khuyến mại'],
  ['SKU-685', 'Áo thun 685', 'Cái', 685000, 30, 479500],
  ['SKU-100', 'Quần 100', 'Cái', 100000, 10, 90000],
];

describe('item-discount-workbook', () => {
  it('ITEM_DISCOUNT_SHEETS: đúng thứ tự, tên và cột giá trị (ADR-01)', () => {
    expect(ITEM_DISCOUNT_SHEETS).toEqual([
      { method: PromotionDiscountMode.PERCENT, name: S_PERCENT, valueHeader: '% giảm giá' },
      { method: PromotionDiscountMode.AMOUNT, name: S_AMOUNT, valueHeader: 'Số tiền giảm' },
      { method: PromotionDiscountMode.FIXED_PRICE, name: S_FIXED, valueHeader: null },
    ]);
    expect(itemDiscountHeaders(PromotionDiscountMode.PERCENT)).toEqual(PERCENT_HEADERS);
    expect(itemDiscountHeaders(PromotionDiscountMode.AMOUNT)).toEqual(AMOUNT_HEADERS);
    expect(itemDiscountHeaders(PromotionDiscountMode.FIXED_PRICE)).toEqual(FIXED_HEADERS);
  });

  describe('buildItemDiscountWorkbook', () => {
    it('AC-12: PERCENT → 3 sheet đúng thứ tự; dữ liệu chỉ ở sheet %, giữ thứ tự dòng; không cột ĐVT/giá', async () => {
      const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.PERCENT, [
        { code: 'SKU-685', name: 'Áo thun 685', unit: 'Cái', sellingPrice: 685000, value: 30 },
        { code: 'SKU-100', name: 'Quần 100', unit: 'Cái', sellingPrice: 100000, value: 10 },
      ]);

      expect(await readSheets(buffer)).toEqual([
        {
          name: S_PERCENT,
          rows: [PERCENT_HEADERS, ['SKU-685', 'Áo thun 685', 30], ['SKU-100', 'Quần 100', 10]],
        },
        { name: S_AMOUNT, rows: [AMOUNT_HEADERS] },
        { name: S_FIXED, rows: [FIXED_HEADERS] },
      ]);
    });

    it('AC-12: AMOUNT → dữ liệu chỉ ở sheet số tiền', async () => {
      const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.AMOUNT, [
        { code: 'SKU-200', name: 'Hàng 200', value: 20000 },
      ]);

      expect(await readSheets(buffer)).toEqual([
        { name: S_PERCENT, rows: [PERCENT_HEADERS] },
        { name: S_AMOUNT, rows: [AMOUNT_HEADERS, ['SKU-200', 'Hàng 200', 20000]] },
        { name: S_FIXED, rows: [FIXED_HEADERS] },
      ]);
    });

    it('AC-13: FIXED_PRICE → dữ liệu ở sheet Đồng giá, chỉ mã + tên (value bị bỏ)', async () => {
      const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.FIXED_PRICE, [
        { code: 'SKU-685', name: 'Áo thun 685', value: 99 },
        { code: 'SKU-200', name: 'Hàng 200' },
      ]);

      expect(await readSheets(buffer)).toEqual([
        { name: S_PERCENT, rows: [PERCENT_HEADERS] },
        { name: S_AMOUNT, rows: [AMOUNT_HEADERS] },
        { name: S_FIXED, rows: [FIXED_HEADERS, ['SKU-685', 'Áo thun 685'], ['SKU-200', 'Hàng 200']] },
      ]);
    });

    it.each(METHODS)('AC-14: lines rỗng (%s) → file mẫu 3 sheet, mỗi sheet chỉ có tiêu đề', async (method) => {
      expect(await readSheets(await buildItemDiscountWorkbook(method, []))).toEqual([
        { name: S_PERCENT, rows: [PERCENT_HEADERS] },
        { name: S_AMOUNT, rows: [AMOUNT_HEADERS] },
        { name: S_FIXED, rows: [FIXED_HEADERS] },
      ]);
    });

    it('dòng thiếu value (mẫu mã) → ô giá trị để trống', async () => {
      const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.PERCENT, [
        { code: 'MM-01', name: 'Mẫu mã 01' },
      ]);
      const [percent] = await readSheets(buffer);
      expect(percent.rows[1].slice(0, 2)).toEqual(['MM-01', 'Mẫu mã 01']);
      expect(percent.rows[1][2] ?? null).toBeNull();
    });
  });

  it('chuẩn hoá tiêu đề: bỏ *, trim, lower-case', () => {
    expect(normalizeItemDiscountHeader('  Mã SKU* ')).toBe('mã sku');
    expect(normalizeItemDiscountHeader('% GIẢM GIÁ')).toBe('% giảm giá');
  });

  describe('parseItemDiscountWorkbook', () => {
    it('AC-19: parse(build(...)) round-trip cho cả 3 phương thức', async () => {
      const lines = [
        { code: 'SKU-685', name: 'Áo thun 685', value: 30 },
        { code: 'MM-01', name: 'Mẫu mã 01', value: 20 },
        { code: 'SKU-100', name: 'Quần 100', value: 10 },
      ];
      for (const method of [PromotionDiscountMode.PERCENT, PromotionDiscountMode.AMOUNT] as const) {
        const buffer = await buildItemDiscountWorkbook(method, lines);
        await expect(parseItemDiscountWorkbook(buffer, method)).resolves.toEqual([
          { rowNumber: 2, code: 'SKU-685', rawValue: 30 },
          { rowNumber: 3, code: 'MM-01', rawValue: 20 },
          { rowNumber: 4, code: 'SKU-100', rawValue: 10 },
        ]);
      }
      const fixed = await buildItemDiscountWorkbook(PromotionDiscountMode.FIXED_PRICE, lines);
      await expect(parseItemDiscountWorkbook(fixed, PromotionDiscountMode.FIXED_PRICE)).resolves.toEqual([
        { rowNumber: 2, code: 'SKU-685', rawValue: null },
        { rowNumber: 3, code: 'MM-01', rawValue: null },
        { rowNumber: 4, code: 'SKU-100', rawValue: null },
      ]);
    });

    describe('AC-15: file 3 sheet → đọc đúng sheet theo phương thức', () => {
      let buffer: Buffer;
      beforeAll(async () => {
        buffer = await workbookBuffer({
          [S_PERCENT]: [PERCENT_HEADERS, ['SKU-685', 'Áo thun 685', 30]],
          [S_AMOUNT]: [AMOUNT_HEADERS, ['SKU-200', 'Hàng 200', 20000]],
          [S_FIXED]: [FIXED_HEADERS, ['SKU-300', 'Hàng 300']],
        });
      });

      it('AMOUNT → chỉ SKU-200', async () => {
        await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.AMOUNT)).resolves.toEqual([
          { rowNumber: 2, code: 'SKU-200', rawValue: 20000 },
        ]);
      });

      it('PERCENT → chỉ SKU-685', async () => {
        await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.PERCENT)).resolves.toEqual([
          { rowNumber: 2, code: 'SKU-685', rawValue: 30 },
        ]);
      });

      it('FIXED_PRICE → chỉ SKU-300, rawValue null', async () => {
        await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.FIXED_PRICE)).resolves.toEqual([
          { rowNumber: 2, code: 'SKU-300', rawValue: null },
        ]);
      });
    });

    it('ADR-02: tên sheet so khớp sau trim, không phân biệt hoa thường; không phụ thuộc thứ tự sheet', async () => {
      const buffer = await workbookBuffer({
        Khác: [['Mã SKU*', '% giảm giá'], ['SKU-X', 1]],
        '  GIẢM GIÁ THEO SỐ TIỀN ': [AMOUNT_HEADERS, ['SKU-200', 'Hàng 200', 20000]],
      });
      await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.AMOUNT)).resolves.toEqual([
        { rowNumber: 2, code: 'SKU-200', rawValue: 20000 },
      ]);
    });

    it.each([
      [PromotionDiscountMode.PERCENT, S_PERCENT],
      [PromotionDiscountMode.AMOUNT, S_AMOUNT],
      [PromotionDiscountMode.FIXED_PRICE, S_FIXED],
    ] as const)('AC-17: file nhiều sheet không có sheet của %s → 400 nêu tên sheet', async (method, name) => {
      const others = ITEM_DISCOUNT_SHEETS.filter((s) => s.method !== method);
      const buffer = await workbookBuffer(
        Object.fromEntries(others.map((s) => [s.name, [itemDiscountHeaders(s.method), ['SKU-1', 'A', 1]]])),
      );
      await expect(parseError(buffer, method)).resolves.toBe(`File không có sheet '${name}'`);
    });

    describe('AC-18: file 1 sheet mẫu cũ (Sheet1, 6 cột, % giảm giá)', () => {
      let buffer: Buffer;
      beforeAll(async () => {
        buffer = await sheetBuffer(LEGACY_PERCENT_ROWS);
      });

      it('PERCENT → đọc như trước', async () => {
        await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.PERCENT)).resolves.toEqual([
          { rowNumber: 2, code: 'SKU-685', rawValue: 30 },
          { rowNumber: 3, code: 'SKU-100', rawValue: 10 },
        ]);
      });

      it('FIXED_PRICE → đọc mã, bỏ qua cột giá trị (A-10)', async () => {
        await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.FIXED_PRICE)).resolves.toEqual([
          { rowNumber: 2, code: 'SKU-685', rawValue: null },
          { rowNumber: 3, code: 'SKU-100', rawValue: null },
        ]);
      });

      it('AMOUNT → 400 cột không khớp phương thức', async () => {
        await expect(parseError(buffer, PromotionDiscountMode.AMOUNT)).resolves.toBe(
          "File có cột '% giảm giá' nhưng chương trình đang giảm theo số tiền",
        );
      });
    });

    it('file 1 sheet "Số tiền giảm" nhưng method PERCENT → 400', async () => {
      const buffer = await sheetBuffer([AMOUNT_HEADERS, ['SKU-1', 'A', 1000]]);
      await expect(parseError(buffer, PromotionDiscountMode.PERCENT)).resolves.toBe(
        "File có cột 'Số tiền giảm' nhưng chương trình đang giảm theo %",
      );
    });

    it('ADR-04: đổi thứ tự cột, thêm cột lạ, tiêu đề khác hoa thường / không có * vẫn đọc đúng', async () => {
      const buffer = await sheetBuffer([
        ['Ghi chú', ' % GIẢM GIÁ ', 'Tên hàng hóa', 'mã sku'],
        ['x', 50, 'Áo', ' SKU-685 '],
        ['y', '15', 'Quần', 'SKU-300'],
      ]);

      await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.PERCENT)).resolves.toEqual([
        { rowNumber: 2, code: 'SKU-685', rawValue: 50 },
        { rowNumber: 3, code: 'SKU-300', rawValue: '15' },
      ]);
    });

    it('bỏ dòng trống, giữ số dòng Excel; mã trống/giá trị trống vẫn trả để handler báo lỗi', async () => {
      const buffer = await sheetBuffer([
        ['Mã SKU*', 'Số tiền giảm'],
        ['SKU-1', 1000],
        [],
        [null, '   '],
        [null, 500],
        ['SKU-2', null],
      ]);

      await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.AMOUNT)).resolves.toEqual([
        { rowNumber: 2, code: 'SKU-1', rawValue: 1000 },
        { rowNumber: 5, code: '', rawValue: 500 },
        { rowNumber: 6, code: 'SKU-2', rawValue: null },
      ]);
    });

    it('FIXED_PRICE: dòng mã trống bị bỏ (A-09), kể cả khi có tên', async () => {
      const buffer = await workbookBuffer({
        [S_FIXED]: [FIXED_HEADERS, ['SKU-685', 'A'], [null, 'Chỉ có tên'], [], ['SKU-200', null]],
      });
      await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.FIXED_PRICE)).resolves.toEqual([
        { rowNumber: 2, code: 'SKU-685', rawValue: null },
        { rowNumber: 5, code: 'SKU-200', rawValue: null },
      ]);
    });

    it('mã dạng số / rich text / công thức → chuỗi; giá trị công thức → kết quả', async () => {
      const buffer = await sheetBuffer([
        ['Mã SKU*', '% giảm giá'],
        [12345, 10],
        [{ richText: [{ text: 'SKU-' }, { text: '685' }] }, { formula: '10+20', result: 30 }],
        [{ formula: '"SKU-"&"100"', result: 'SKU-100' }, 'abc'],
      ]);

      await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.PERCENT)).resolves.toEqual([
        { rowNumber: 2, code: '12345', rawValue: 10 },
        { rowNumber: 3, code: 'SKU-685', rawValue: 30 },
        { rowNumber: 4, code: 'SKU-100', rawValue: 'abc' },
      ]);
    });

    it.each(METHODS)('thiếu cột Mã SKU (%s) → 400', async (method) => {
      const buffer = await sheetBuffer([['Tên hàng hóa', '% giảm giá'], ['Áo', 10]]);
      await expect(parseError(buffer, method)).resolves.toBe("File thiếu cột 'Mã SKU'");
    });

    it('thiếu cả hai cột giá trị → 400 nêu cột của phương thức; FIXED_PRICE không cần cột giá trị', async () => {
      const buffer = await sheetBuffer([['Mã SKU*', 'Tên hàng hóa'], ['SKU-1', 'A']]);
      await expect(parseError(buffer, PromotionDiscountMode.AMOUNT)).resolves.toBe(
        "File thiếu cột 'Số tiền giảm'",
      );
      await expect(parseError(buffer, PromotionDiscountMode.PERCENT)).resolves.toBe(
        "File thiếu cột '% giảm giá'",
      );
      await expect(parseItemDiscountWorkbook(buffer, PromotionDiscountMode.FIXED_PRICE)).resolves.toEqual([
        { rowNumber: 2, code: 'SKU-1', rawValue: null },
      ]);
    });

    it('đúng 2.000 dòng dữ liệu → đọc được; 2.001 dòng → 400', async () => {
      const lines = (n: number) =>
        Array.from({ length: n }, (_, i) => ({ code: `SKU-${i}`, name: `H${i}`, value: 10 }));

      const ok = await buildItemDiscountWorkbook(PromotionDiscountMode.PERCENT, lines(2000));
      await expect(parseItemDiscountWorkbook(ok, PromotionDiscountMode.PERCENT)).resolves.toHaveLength(2000);

      const tooMany = await buildItemDiscountWorkbook(PromotionDiscountMode.PERCENT, lines(2001));
      await expect(parseError(tooMany, PromotionDiscountMode.PERCENT)).resolves.toBe(
        'File vượt quá 2.000 dòng',
      );
    });

    it.each([
      ['buffer rác', Buffer.from('not an excel file at all')],
      ['buffer rỗng', Buffer.alloc(0)],
      ['file CSV', Buffer.from('Mã SKU*,% giảm giá\nSKU-1,10\n', 'utf8')],
    ])('%s → 400 "File không đúng định dạng .xlsx"', async (_label, buffer) => {
      await expect(parseError(buffer, PromotionDiscountMode.PERCENT)).resolves.toBe(
        'File không đúng định dạng .xlsx',
      );
    });
  });
});
