import 'reflect-metadata';
import * as ExcelJS from 'exceljs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PromotionDiscountMode, PromotionTargetType } from '@erp/shared-interfaces';
import { ExportItemDiscountLinesHandler } from './export-item-discount-lines.handler';
import { ExportItemDiscountLinesQuery } from './export-item-discount-lines.query';
import { ExportItemDiscountLinesDto } from '../dto/item-discount-excel.dto';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import * as workbook from '../../infrastructure/excel/item-discount-workbook';

const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

const ITEM_685 = '11111111-1111-4111-8111-111111111111';
const ITEM_100 = '22222222-2222-4222-8222-222222222222';
const PRODUCT_1 = '33333333-3333-4333-8333-333333333333';
const FOREIGN_ITEM = '44444444-4444-4444-8444-444444444444';
const FOREIGN_PRODUCT = '55555555-5555-4555-8555-555555555555';

function dto(method: PromotionDiscountMode, lines: ExportItemDiscountLinesDto['lines']): ExportItemDiscountLinesDto {
  return { method, lines } as ExportItemDiscountLinesDto;
}

async function readRows(buffer: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const rows: unknown[][] = [];
  wb.worksheets[0].eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  return rows;
}

describe('ExportItemDiscountLinesHandler', () => {
  let itemRepo: { find: jest.Mock };
  let productRepo: { find: jest.Mock };
  let handler: ExportItemDiscountLinesHandler;
  let buildSpy: jest.SpyInstance;

  beforeEach(() => {
    // Repos only return rows of the actor's org, like the real `organizationId` filter.
    itemRepo = {
      find: jest.fn().mockResolvedValue([
        { id: ITEM_100, code: 'SKU-100', name: 'Hàng 100', unit: 'cái', sellingPrice: '100000.00' },
        { id: ITEM_685, code: 'SKU-685', name: 'Hàng 685', unit: 'hộp', sellingPrice: '685000.00' },
      ]),
    };
    productRepo = { find: jest.fn().mockResolvedValue([{ id: PRODUCT_1, code: 'PRD-1', name: 'Sản phẩm 1' }]) };
    handler = new ExportItemDiscountLinesHandler(itemRepo as any, productRepo as any);
    buildSpy = jest.spyOn(workbook, 'buildItemDiscountWorkbook');
  });

  afterEach(() => buildSpy.mockRestore());

  it('queries items and products once each, scoped to the actor organization', async () => {
    await handler.execute(
      new ExportItemDiscountLinesQuery(
        dto(PromotionDiscountMode.PERCENT, [
          { targetType: PromotionTargetType.ITEM, targetId: ITEM_685, value: 30 },
          { targetType: PromotionTargetType.PRODUCT, targetId: PRODUCT_1, value: 5 },
          { targetType: PromotionTargetType.ITEM, targetId: ITEM_100, value: 10 },
        ]),
        actor,
      ),
    );

    expect(itemRepo.find).toHaveBeenCalledTimes(1);
    expect(productRepo.find).toHaveBeenCalledTimes(1);
    const itemWhere = itemRepo.find.mock.calls[0][0].where;
    expect(itemWhere.organizationId).toBe('org-1');
    expect(itemWhere.id.value).toEqual([ITEM_685, ITEM_100]);
    const productWhere = productRepo.find.mock.calls[0][0].where;
    expect(productWhere.organizationId).toBe('org-1');
    expect(productWhere.id.value).toEqual([PRODUCT_1]);
  });

  it('AC-12: drops lines whose target is not in the actor organization, without leaking code/name', async () => {
    const buffer = await handler.execute(
      new ExportItemDiscountLinesQuery(
        dto(PromotionDiscountMode.PERCENT, [
          { targetType: PromotionTargetType.ITEM, targetId: FOREIGN_ITEM, value: 50 },
          { targetType: PromotionTargetType.ITEM, targetId: ITEM_685, value: 30 },
          { targetType: PromotionTargetType.PRODUCT, targetId: FOREIGN_PRODUCT, value: 20 },
        ]),
        actor,
      ),
    );

    expect(buildSpy).toHaveBeenCalledWith(PromotionDiscountMode.PERCENT, [
      { code: 'SKU-685', name: 'Hàng 685', unit: 'hộp', sellingPrice: 685000, value: 30 },
    ]);
    const rows = await readRows(buffer);
    expect(rows).toHaveLength(2); // header + SKU-685 only
    expect(rows[1][0]).toBe('SKU-685');
  });

  it('AC-09: keeps request order and leaves unit/price empty for PRODUCT rows', async () => {
    const buffer = await handler.execute(
      new ExportItemDiscountLinesQuery(
        dto(PromotionDiscountMode.PERCENT, [
          { targetType: PromotionTargetType.ITEM, targetId: ITEM_685, value: 30 },
          { targetType: PromotionTargetType.PRODUCT, targetId: PRODUCT_1, value: 5 },
          { targetType: PromotionTargetType.ITEM, targetId: ITEM_100, value: 10 },
        ]),
        actor,
      ),
    );

    expect(buildSpy).toHaveBeenCalledWith(PromotionDiscountMode.PERCENT, [
      { code: 'SKU-685', name: 'Hàng 685', unit: 'hộp', sellingPrice: 685000, value: 30 },
      { code: 'PRD-1', name: 'Sản phẩm 1', value: 5 },
      { code: 'SKU-100', name: 'Hàng 100', unit: 'cái', sellingPrice: 100000, value: 10 },
    ]);

    const rows = await readRows(buffer);
    expect(rows[0]).toEqual(['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', '% giảm giá', 'Giá khuyến mại']);
    expect(rows[1]).toEqual(['SKU-685', 'Hàng 685', 'hộp', 685000, 30, 479500]);
    expect(rows[2][0]).toBe('PRD-1');
    expect(rows[2][2]).toBeUndefined(); // ĐVT
    expect(rows[2][3]).toBeUndefined(); // Giá bán
    expect(rows[2][5]).toBeUndefined(); // Giá khuyến mại
    expect(rows[3].slice(0, 2)).toEqual(['SKU-100', 'Hàng 100']);
  });

  it('builds a header-only template and skips DB queries when there are no lines', async () => {
    const buffer = await handler.execute(new ExportItemDiscountLinesQuery(dto(PromotionDiscountMode.AMOUNT, []), actor));

    expect(itemRepo.find).not.toHaveBeenCalled();
    expect(productRepo.find).not.toHaveBeenCalled();
    const rows = await readRows(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0][4]).toBe('Số tiền giảm');
  });
});

describe('ExportItemDiscountLinesDto validation', () => {
  const line = { targetType: PromotionTargetType.ITEM, targetId: ITEM_685, value: 30 };

  async function errorsFor(body: object) {
    return validate(plainToInstance(ExportItemDiscountLinesDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  it('accepts PERCENT and AMOUNT with ITEM/PRODUCT lines', async () => {
    expect(await errorsFor({ method: 'PERCENT', lines: [line] })).toHaveLength(0);
    expect(
      await errorsFor({ method: 'AMOUNT', lines: [{ targetType: 'PRODUCT', targetId: PRODUCT_1 }] }),
    ).toHaveLength(0);
  });

  it('rejects FIXED_PRICE, CATEGORY targets, non-uuid ids and more than 2000 lines', async () => {
    expect(await errorsFor({ method: 'FIXED_PRICE', lines: [line] })).not.toHaveLength(0);
    expect(await errorsFor({ method: 'PERCENT', lines: [{ ...line, targetType: 'CATEGORY' }] })).not.toHaveLength(0);
    expect(await errorsFor({ method: 'PERCENT', lines: [{ ...line, targetId: 'nope' }] })).not.toHaveLength(0);
    expect(await errorsFor({ method: 'PERCENT', lines: Array(2001).fill(line) })).not.toHaveLength(0);
  });
});
