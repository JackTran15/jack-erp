import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindOperator } from 'typeorm';
import { PromotionDiscountMode, PromotionTargetType } from '@erp/shared-interfaces';
import { ImportItemDiscountLinesHandler } from './import-item-discount-lines.handler';
import { ImportItemDiscountLinesQuery } from './import-item-discount-lines.query';
import { ImportItemDiscountLinesDto, ItemDiscountExcelMethod } from '../dto/item-discount-excel.dto';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { itemDiscountHeaders } from '../../infrastructure/excel/item-discount-workbook';

const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

interface Row {
  id: string;
  organizationId: string;
  code: string | null;
  name: string;
}

const ITEMS: Row[] = [
  { id: 'item-685', organizationId: 'org-1', code: 'SKU-685', name: 'Hàng 685' },
  { id: 'item-200', organizationId: 'org-1', code: 'SKU-200', name: 'Hàng 200' },
  { id: 'item-foreign', organizationId: 'org-2', code: 'SKU-OTHER', name: 'Hàng tổ chức khác' },
];

const PRODUCTS: Row[] = [
  { id: 'product-1', organizationId: 'org-1', code: 'PRD-1', name: 'Mẫu mã 1' },
  { id: 'product-foreign', organizationId: 'org-2', code: 'PRD-OTHER', name: 'Mẫu mã tổ chức khác' },
];

/** Normalized codes carried by the `LOWER(TRIM(code)) IN (:...codes)` operator. */
function codesOf(where: { code: FindOperator<unknown> }): string[] {
  return (where.code.objectLiteralParameters as { codes: string[] }).codes;
}

/** Fake `find` that applies the same org + normalized-code filter the SQL would. */
function fakeRepo(rows: Row[]) {
  return {
    find: jest.fn(async ({ where }: { where: { organizationId: string; code: FindOperator<unknown> } }) => {
      const codes = codesOf(where);
      return rows.filter(
        (r) => r.organizationId === where.organizationId && r.code !== null && codes.includes(r.code.trim().toLowerCase()),
      );
    }),
  };
}

/** `[code, value]` per data row; row 1 is the header of `method`. */
async function workbook(method: ItemDiscountExcelMethod, rows: [unknown, unknown][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  sheet.addRow(itemDiscountHeaders(method));
  for (const [code, value] of rows) sheet.addRow([code, null, null, null, value, null]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('ImportItemDiscountLinesHandler', () => {
  let itemRepo: ReturnType<typeof fakeRepo>;
  let productRepo: ReturnType<typeof fakeRepo>;
  let handler: ImportItemDiscountLinesHandler;

  beforeEach(() => {
    itemRepo = fakeRepo(ITEMS);
    productRepo = fakeRepo(PRODUCTS);
    handler = new ImportItemDiscountLinesHandler(itemRepo as any, productRepo as any);
  });

  async function run(method: ItemDiscountExcelMethod, rows: [unknown, unknown][]) {
    return handler.execute(new ImportItemDiscountLinesQuery(await workbook(method, rows), method, actor));
  }

  it('AC-14: returns every valid row with rowNumber, target, DB code/name and value, and no errors', async () => {
    const result = await run(PromotionDiscountMode.PERCENT, [
      ['SKU-685', 30],
      ['SKU-200', 20],
    ]);

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, targetType: PromotionTargetType.ITEM, targetId: 'item-685', code: 'SKU-685', name: 'Hàng 685', value: 30 },
      { rowNumber: 3, targetType: PromotionTargetType.ITEM, targetId: 'item-200', code: 'SKU-200', name: 'Hàng 200', value: 20 },
    ]);
    expect(itemRepo.find).toHaveBeenCalledTimes(1);
    expect(productRepo.find).not.toHaveBeenCalled();
  });

  it('AC-14: AMOUNT accepts a number or a plain numeric string above 100', async () => {
    const result = await run(PromotionDiscountMode.AMOUNT, [
      ['SKU-685', 50000],
      ['SKU-200', ' 1500.5 '],
    ]);

    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.value)).toEqual([50000, 1500.5]);
  });

  describe('AC-15: row errors carry the Excel row number and a Vietnamese reason', () => {
    it('unknown code → "Không tìm thấy hàng hóa có mã ..."; valid rows are still returned', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-685', 30],
        ['SKU-NOPE', 10],
      ]);

      expect(result.rows.map((r) => r.rowNumber)).toEqual([2]);
      expect(result.errors).toEqual([
        { rowNumber: 3, code: 'SKU-NOPE', message: "Không tìm thấy hàng hóa có mã 'SKU-NOPE'" },
      ]);
    });

    it('empty code with a value → "Thiếu mã SKU"', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-685', 30],
        [null, 15],
      ]);

      expect(result.rows.map((r) => r.rowNumber)).toEqual([2]);
      expect(result.errors).toEqual([{ rowNumber: 3, message: 'Thiếu mã SKU' }]);
    });

    it.each<[string, unknown]>([
      ['blank', null],
      ['not a number', 'abc'],
      ['zero', 0],
      ['negative', -5],
      ['over 100', 120],
    ])('PERCENT value %s → "%% giảm giá phải lớn hơn 0 và không quá 100"', async (_label, value) => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-200', 20],
        ['SKU-685', value],
      ]);

      expect(result.rows.map((r) => r.rowNumber)).toEqual([2]);
      expect(result.errors).toEqual([
        { rowNumber: 3, code: 'SKU-685', message: '% giảm giá phải lớn hơn 0 và không quá 100' },
      ]);
    });

    it('PERCENT accepts exactly 100 and a numeric string', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-685', 100],
        ['SKU-200', '12.5'],
      ]);

      expect(result.errors).toEqual([]);
      expect(result.rows.map((r) => r.value)).toEqual([100, 12.5]);
    });

    it.each<[string, unknown]>([
      ['blank', null],
      ['not a number', '10k'],
      ['zero', 0],
      ['negative', -1],
    ])('AMOUNT value %s → "Số tiền giảm phải lớn hơn 0"', async (_label, value) => {
      const result = await run(PromotionDiscountMode.AMOUNT, [['SKU-685', value]]);

      expect(result.rows).toEqual([]);
      expect(result.errors).toEqual([{ rowNumber: 2, code: 'SKU-685', message: 'Số tiền giảm phải lớn hơn 0' }]);
    });

    it('same code twice (after trim/case) → every such row errors, listing all row numbers', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-685', 30],
        ['SKU-200', 20],
        [' sku-685 ', 40],
      ]);

      expect(result.rows.map((r) => r.rowNumber)).toEqual([3]);
      expect(result.errors).toEqual([
        { rowNumber: 2, code: 'SKU-685', message: 'Mã SKU bị trùng trong file (dòng 2, 4)' },
        { rowNumber: 4, code: 'sku-685', message: 'Mã SKU bị trùng trong file (dòng 2, 4)' },
      ]);
    });

    it('reports one reason per row by priority (duplicate before value, value before not found)', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-685', 500],
        ['SKU-685', 30],
        ['SKU-NOPE', 0],
      ]);

      expect(result.errors).toEqual([
        { rowNumber: 2, code: 'SKU-685', message: 'Mã SKU bị trùng trong file (dòng 2, 3)' },
        { rowNumber: 3, code: 'SKU-685', message: 'Mã SKU bị trùng trong file (dòng 2, 3)' },
        { rowNumber: 4, code: 'SKU-NOPE', message: '% giảm giá phải lớn hơn 0 và không quá 100' },
      ]);
      expect(itemRepo.find).not.toHaveBeenCalled();
    });

    it('a file mixing every error keeps rows and errors in file order', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-NOPE', 10],
        ['SKU-685', 30],
        [null, 5],
        ['SKU-200', 120],
        ['PRD-1', 15],
      ]);

      expect(result.rows.map((r) => [r.rowNumber, r.code])).toEqual([
        [3, 'SKU-685'],
        [6, 'PRD-1'],
      ]);
      expect(result.errors.map((e) => [e.rowNumber, e.message])).toEqual([
        [2, "Không tìm thấy hàng hóa có mã 'SKU-NOPE'"],
        [4, 'Thiếu mã SKU'],
        [5, '% giảm giá phải lớn hơn 0 và không quá 100'],
      ]);
    });
  });

  describe('AC-17: code matching', () => {
    it('ignores case and surrounding whitespace, returning the DB code', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [[' sku-685 ', 30]]);

      expect(result.errors).toEqual([]);
      expect(result.rows).toEqual([
        { rowNumber: 2, targetType: PromotionTargetType.ITEM, targetId: 'item-685', code: 'SKU-685', name: 'Hàng 685', value: 30 },
      ]);
      expect(codesOf(itemRepo.find.mock.calls[0][0].where)).toEqual(['sku-685']);
    });

    it('matches a product (model) code as PRODUCT, looking up only codes not found in items', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-685', 30],
        ['prd-1', 15],
      ]);

      expect(result.errors).toEqual([]);
      expect(result.rows[1]).toEqual({
        rowNumber: 3,
        targetType: PromotionTargetType.PRODUCT,
        targetId: 'product-1',
        code: 'PRD-1',
        name: 'Mẫu mã 1',
        value: 15,
      });
      expect(itemRepo.find).toHaveBeenCalledTimes(1);
      expect(productRepo.find).toHaveBeenCalledTimes(1);
      expect(codesOf(itemRepo.find.mock.calls[0][0].where)).toEqual(['sku-685', 'prd-1']);
      expect(codesOf(productRepo.find.mock.calls[0][0].where)).toEqual(['prd-1']);
    });

    it('looks codes up with LOWER(TRIM(code)) IN (...)', async () => {
      await run(PromotionDiscountMode.PERCENT, [['SKU-685', 30]]);

      const operator: FindOperator<unknown> = itemRepo.find.mock.calls[0][0].where.code;
      expect(operator.type).toBe('raw');
      expect((operator.getSql as (alias: string) => string)('"code"')).toBe('LOWER(TRIM("code")) IN (:...codes)');
    });
  });

  describe('AC-18: codes of another organization', () => {
    it('scopes both lookups to the actor organization and reports foreign codes as not found', async () => {
      const result = await run(PromotionDiscountMode.PERCENT, [
        ['SKU-OTHER', 10],
        ['PRD-OTHER', 20],
      ]);

      expect(result.rows).toEqual([]);
      expect(result.errors).toEqual([
        { rowNumber: 2, code: 'SKU-OTHER', message: "Không tìm thấy hàng hóa có mã 'SKU-OTHER'" },
        { rowNumber: 3, code: 'PRD-OTHER', message: "Không tìm thấy hàng hóa có mã 'PRD-OTHER'" },
      ]);
      expect(itemRepo.find.mock.calls[0][0].where.organizationId).toBe('org-1');
      expect(productRepo.find.mock.calls[0][0].where.organizationId).toBe('org-1');
    });
  });

  describe('ImportItemDiscountLinesDto', () => {
    it.each([PromotionDiscountMode.PERCENT, PromotionDiscountMode.AMOUNT])('accepts method %s', async (method) => {
      expect(await validate(plainToInstance(ImportItemDiscountLinesDto, { method }))).toEqual([]);
    });

    it('rejects FIXED_PRICE', async () => {
      const errors = await validate(
        plainToInstance(ImportItemDiscountLinesDto, { method: PromotionDiscountMode.FIXED_PRICE }),
      );
      expect(errors.map((e) => e.property)).toEqual(['method']);
    });
  });
});
