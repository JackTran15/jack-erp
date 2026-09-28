import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PromotionDiscountMode } from '@erp/shared-interfaces';
import {
  ITEM_DISCOUNT_COLUMNS,
  buildItemDiscountWorkbook,
  itemDiscountHeaders,
  itemDiscountValueHeader,
  normalizeItemDiscountHeader,
  parseItemDiscountWorkbook,
} from './item-discount-workbook';

async function sheetBuffer(rows: ExcelJS.CellValue[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  rows.forEach((values, i) => {
    const row = sheet.getRow(i + 1);
    values.forEach((value, c) => {
      if (value !== undefined) row.getCell(c + 1).value = value;
    });
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function parseError(buffer: Buffer, method: PromotionDiscountMode.PERCENT | PromotionDiscountMode.AMOUNT) {
  const err = await parseItemDiscountWorkbook(buffer, method).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(BadRequestException);
  return (err as BadRequestException).message;
}

async function readRows(buffer: Buffer): Promise<ExcelJS.CellValue[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  const rows: ExcelJS.CellValue[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: ExcelJS.CellValue[] = [];
    for (let c = 1; c <= ITEM_DISCOUNT_COLUMNS.length; c++) {
      values.push(row.getCell(c).value);
    }
    rows.push(values);
  });
  return rows;
}

describe('item-discount-workbook', () => {
  it('AC-09: PERCENT — tiêu đề đúng thứ tự, dòng giữ thứ tự, SKU-685 685.000 @30% → 479.500', async () => {
    const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.PERCENT, [
      { code: 'SKU-685', name: 'Áo thun 685', unit: 'Cái', sellingPrice: 685000, value: 30 },
      { code: 'SKU-100', name: 'Quần 100', unit: 'Cái', sellingPrice: 100000, value: 10 },
    ]);

    const rows = await readRows(buffer);
    expect(rows).toEqual([
      ['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', '% giảm giá', 'Giá khuyến mại'],
      ['SKU-685', 'Áo thun 685', 'Cái', 685000, 30, 479500],
      ['SKU-100', 'Quần 100', 'Cái', 100000, 10, 90000],
    ]);
  });

  it('AC-10: AMOUNT — cột "Số tiền giảm", giảm vượt giá bán → giá KM 0', async () => {
    const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.AMOUNT, [
      { code: 'SKU-100', name: 'Quần 100', unit: 'Cái', sellingPrice: 100000, value: 150000 },
      { code: 'SKU-685', name: 'Áo thun 685', unit: 'Cái', sellingPrice: 685000, value: 85000 },
    ]);

    const rows = await readRows(buffer);
    expect(rows[0][4]).toBe('Số tiền giảm');
    expect(rows[1]).toEqual(['SKU-100', 'Quần 100', 'Cái', 100000, 150000, 0]);
    expect(rows[2]).toEqual(['SKU-685', 'Áo thun 685', 'Cái', 685000, 85000, 600000]);
  });

  it.each([PromotionDiscountMode.PERCENT, PromotionDiscountMode.AMOUNT] as const)(
    'AC-11: lines rỗng (%s) → chỉ có hàng tiêu đề, cột giá trị theo phương thức',
    async (method) => {
      const rows = await readRows(await buildItemDiscountWorkbook(method, []));
      expect(rows).toEqual([itemDiscountHeaders(method)]);
      expect(rows[0][4]).toBe(itemDiscountValueHeader(method));
    },
  );

  it('để trống giá KM khi thiếu giá bán hoặc giá trị giảm (dòng mẫu mã)', async () => {
    const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.PERCENT, [
      { code: 'MM-01', name: 'Mẫu mã 01', value: 20 },
      { code: 'SKU-685', name: 'Áo thun 685', unit: 'Cái', sellingPrice: 685000 },
    ]);

    const rows = await readRows(buffer);
    expect(rows[1]).toEqual(['MM-01', 'Mẫu mã 01', null, null, 20, null]);
    expect(rows[2]).toEqual(['SKU-685', 'Áo thun 685', 'Cái', 685000, null, null]);
  });

  it('chuẩn hoá tiêu đề: bỏ *, trim, lower-case', () => {
    expect(normalizeItemDiscountHeader('  Mã SKU* ')).toBe('mã sku');
    expect(normalizeItemDiscountHeader('% GIẢM GIÁ')).toBe('% giảm giá');
  });

  describe('parseItemDiscountWorkbook', () => {
    it.each([PromotionDiscountMode.PERCENT, PromotionDiscountMode.AMOUNT] as const)(
      'AC-20: parse(build(...)) (%s) trả đúng mã + giá trị, đúng số dòng Excel',
      async (method) => {
        const buffer = await buildItemDiscountWorkbook(method, [
          { code: 'SKU-685', name: 'Áo thun 685', unit: 'Cái', sellingPrice: 685000, value: 30 },
          { code: 'MM-01', name: 'Mẫu mã 01', value: 20 },
          { code: 'SKU-100', name: 'Quần 100', unit: 'Cái', sellingPrice: 100000, value: 10 },
        ]);

        await expect(parseItemDiscountWorkbook(buffer, method)).resolves.toEqual([
          { rowNumber: 2, code: 'SKU-685', rawValue: 30 },
          { rowNumber: 3, code: 'MM-01', rawValue: 20 },
          { rowNumber: 4, code: 'SKU-100', rawValue: 10 },
        ]);
      },
    );

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

    it('bỏ dòng trống, giữ số dòng Excel; mã trống/giá trị trống vẫn trả để T-04-02 báo lỗi', async () => {
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

    it('AC-16: thiếu cột Mã SKU → 400', async () => {
      const buffer = await sheetBuffer([['Tên hàng hóa', '% giảm giá'], ['Áo', 10]]);
      await expect(parseError(buffer, PromotionDiscountMode.PERCENT)).resolves.toBe(
        "File thiếu cột 'Mã SKU'",
      );
    });

    it('AC-16: file "Số tiền giảm" nhưng method PERCENT → 400', async () => {
      const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.AMOUNT, [
        { code: 'SKU-1', name: 'A', value: 1000 },
      ]);
      await expect(parseError(buffer, PromotionDiscountMode.PERCENT)).resolves.toBe(
        "File có cột 'Số tiền giảm' nhưng chương trình đang giảm theo %",
      );
    });

    it('AC-16: file "% giảm giá" nhưng method AMOUNT → 400', async () => {
      const buffer = await buildItemDiscountWorkbook(PromotionDiscountMode.PERCENT, [
        { code: 'SKU-1', name: 'A', value: 10 },
      ]);
      await expect(parseError(buffer, PromotionDiscountMode.AMOUNT)).resolves.toBe(
        "File có cột '% giảm giá' nhưng chương trình đang giảm theo số tiền",
      );
    });

    it('thiếu cả hai cột giá trị → 400 nêu cột của phương thức', async () => {
      const buffer = await sheetBuffer([['Mã SKU*', 'Tên hàng hóa'], ['SKU-1', 'A']]);
      await expect(parseError(buffer, PromotionDiscountMode.AMOUNT)).resolves.toBe(
        "File thiếu cột 'Số tiền giảm'",
      );
      await expect(parseError(buffer, PromotionDiscountMode.PERCENT)).resolves.toBe(
        "File thiếu cột '% giảm giá'",
      );
    });

    it('AC-19: đúng 2.000 dòng dữ liệu → đọc được; 2.001 dòng → 400', async () => {
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
    ])('AC-19: %s → 400 "File không đúng định dạng .xlsx"', async (_label, buffer) => {
      await expect(parseError(buffer, PromotionDiscountMode.PERCENT)).resolves.toBe(
        'File không đúng định dạng .xlsx',
      );
    });
  });
});
