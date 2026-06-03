import * as ExcelJS from 'exceljs';
import { ValueType } from 'exceljs';
import { InventoryImportWorkbookService } from './import-workbook/inventory-import-workbook.service';
import { InventoryImportTemplateSheetKey } from './import-workbook/inventory-import-template-sheet.constants';
import { ExcelParserService } from './excel-parser.service';
import { estimateInventoryImportColumnWidth } from './import-workbook/sheets/data/data-sheet.layout';
import {
  InventoryImportExcelField,
  type InventoryImportExcelRow,
} from '@erp/shared-interfaces';
import { parseInventoryItemsFromDelimitedText } from './inventory-import-delimited.parser';
import { buildInventoryImportDelimitedCsv } from './inventory-import-delimited-export.utils';

const GOLDEN_GUIDE_GRID: string[][] = [
  ['TH1: Nhập mới hàng hóa'],
  ['STT', 'Mã SKU', 'Tên hàng hóa', 'Giá bán', 'Giá mua'],
  ['1', 'GOLDEN-SKU', 'Giày golden', '500.000', '300.000'],
];

const GOLDEN_FIELD_GRID: string[][] = [
  ['STT', 'Nhóm', 'Tên cột', 'Diễn giải', 'Giá trị nếu để trống'],
  ['1', 'Thông tin hàng hóa', 'Mã SKU', 'Mã định danh SKU', 'Bắt buộc'],
  ['', '', 'Link ảnh hàng hóa', 'URL ảnh sản phẩm', ''],
];

function createWorkbookService(): InventoryImportWorkbookService {
  return new InventoryImportWorkbookService();
}

describe('Inventory import/export golden (standard template)', () => {
  const parser = new ExcelParserService();
  const workbookService = createWorkbookService();

  const templateGrids = {
    [InventoryImportTemplateSheetKey.GUIDE]: GOLDEN_GUIDE_GRID,
    [InventoryImportTemplateSheetKey.FIELD]: GOLDEN_FIELD_GRID,
  };

  it('parses semicolon grid export from generated fixture', () => {
    const text = buildInventoryImportDelimitedCsv([
      {
        rawData: {
          [InventoryImportExcelField.SKU_CODE]: 'FIXTURE-001',
          [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Giay fixture',
          [InventoryImportExcelField.COST_PRICE]: '350.000',
        },
      },
      {
        rawData: {
          [InventoryImportExcelField.SKU_CODE]: 'FIXTURE-002',
          [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Giay fixture 2',
          [InventoryImportExcelField.COST_PRICE]: '150.000',
        },
      },
    ]);
    const rows = parseInventoryItemsFromDelimitedText(text);

    expect(rows.length).toBe(2);
    expect(rows[0][InventoryImportExcelField.SKU_CODE]).toBe('FIXTURE-001');
    expect(rows[0][InventoryImportExcelField.COST_PRICE]).toBe('350.000');
  });

  it('exports template with hidden rows and colored group headers', async () => {
    const buffer = await workbookService.buildItemsWorkbookBuffer(
      [
        {
          [InventoryImportExcelField.SKU_CODE]: 'GOLDEN-001',
          [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Giày test',
        } as unknown as InventoryImportExcelRow,
      ],
      { templateGrids },
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.getWorksheet('Danh sách hàng hóa')!;

    expect(ws.getRow(1).hidden).toBe(true);
    expect(ws.getRow(2).hidden).toBe(true);
    expect(ws.getCell(3, 1).value).toBe('THÔNG TIN HÀNG HÓA');
    expect((ws.getCell(3, 1).fill as any)?.fgColor?.argb).toBe('FFFFFF00');
    expect(ws.getCell(3, 31).value).toBe('Vị trí trưng bày');
    expect(ws.getCell(3, 31).isMerged).toBe(true);
    expect(
      estimateInventoryImportColumnWidth('Hiển thị trên màn hình bán hàng'),
    ).toBeGreaterThanOrEqual(38);
    expect((ws.getCell(3, 1).border as any)?.top?.style).toBe('thin');
    expect(String(ws.getCell(4, 26).value ?? '')).toBe('');
  });

  it('exports three sheets with guide and field spot-checks', async () => {
    const buffer = await workbookService.buildItemsWorkbookBuffer([], {
      templateGrids,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);

    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Danh sách hàng hóa',
      'Hướng dẫn nhập',
      'Mô tả các trường nhập',
    ]);

    const guide = wb.getWorksheet('Hướng dẫn nhập')!;
    expect(guide.getCell(1, 1).value).toBe('TH1: Nhập mới hàng hóa');
    expect((guide.getCell(1, 1).fill as any)?.fgColor?.argb).toBe('FFE4DFEC');
    expect(guide.getCell(2, 2).value).toBe('Mã SKU');
    expect((guide.getCell(2, 4).fill as any)?.fgColor?.argb).toBe('FFFFFF00');

    const field = wb.getWorksheet('Mô tả các trường nhập')!;
    expect(field.getCell(1, 1).value).toBe('STT');
    expect((field.getCell(1, 1).fill as any)?.fgColor?.argb).toBe('FFFFFF00');
    expect(field.getCell(3, 3).value).toBe('Link ảnh hàng hóa');
    expect((field.getCell(3, 1).fill as any)?.fgColor?.argb).toBe('FFFFC000');
  });

  it('exports money columns as MISA-style grouped text (350.000)', async () => {
    const buffer = await workbookService.buildItemsWorkbookBuffer(
      [
        {
          [InventoryImportExcelField.SKU_CODE]: 'NUM-001',
          [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Test số',
          [InventoryImportExcelField.COST_PRICE]: 350000,
          [InventoryImportExcelField.UNIT_PRICE]: 750000,
          [InventoryImportExcelField.MINIMUM_STOCK]: 0,
          [InventoryImportExcelField.HEIGHT]: 0,
        },
      ],
      { templateGrids },
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.getWorksheet('Danh sách hàng hóa')!;

    expect(ws.getCell(5, 12).value).toBe('350.000');
    expect(ws.getCell(5, 13).value).toBe('750.000');
    expect(ws.getCell(5, 18).value).toBe('0');
    expect(ws.getCell(5, 27).type).toBe(ValueType.Number);
  });

  it('exports empty template without sample data rows', async () => {
    const buffer = await workbookService.buildItemsWorkbookBuffer([], {
      templateGrids,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.getWorksheet('Danh sách hàng hóa')!;
    expect(ws.getCell(5, 1).value).toBeFalsy();
  });

  it('supports trailing status column for error export workbook', async () => {
    const buffer = await workbookService.buildItemsWorkbookBuffer(
      [
        {
          [InventoryImportExcelField.SKU_CODE]: 'ERR-001',
          [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Hàng lỗi',
          ImportValidationStatus: 'Mã SKU đã tồn tại',
        } as unknown as InventoryImportExcelRow,
      ],
      {
        templateGrids,
        extraColumn: { key: 'ImportValidationStatus', label: 'Tình trạng' },
      },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.getWorksheet('Danh sách hàng hóa')!;
    expect(ws.getCell(2, 44).value).toBe('ImportValidationStatus');
    expect(ws.getCell(3, 44).value).toBe('Tình trạng');
    expect(ws.getCell(3, 44).isMerged).toBe(true);
    expect(ws.getCell(5, 44).value).toBe('Mã SKU đã tồn tại');
  });

  it('round-trips export buffer through ExcelParserService', async () => {
    const buffer = await workbookService.buildItemsWorkbookBuffer(
      [
        {
          [InventoryImportExcelField.SKU_CODE]: 'ROUNDTRIP-001',
          [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Hàng roundtrip',
          [InventoryImportExcelField.UNIT_NAME]: 'Cái',
          [InventoryImportExcelField.COST_PRICE]: '100.000',
        } as unknown as InventoryImportExcelRow,
      ],
      { templateGrids },
    );

    const rows = await parser.parseInventoryItemsWorkbook(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0][InventoryImportExcelField.SKU_CODE]).toBe('ROUNDTRIP-001');
  });
});
