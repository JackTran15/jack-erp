import * as ExcelJS from 'exceljs';
import { InventoryImportExcelField } from '@erp/shared-interfaces';
import { ExcelParserService } from './excel-parser.service';

function fillSheetRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  values: string[],
): void {
  values.forEach((value, columnIndex) => {
    sheet.getCell(rowIndex, columnIndex + 1).value = value;
  });
}

async function buildSampleWorkbookBuffer(
  rows: Array<Record<string, string>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách hàng hóa');
  const keys = [
    InventoryImportExcelField.SKU_CODE,
    InventoryImportExcelField.BAR_CODE,
    InventoryImportExcelField.INVENTORY_ITEM_NAME,
    InventoryImportExcelField.UNIT_NAME,
    InventoryImportExcelField.COST_PRICE,
  ];
  const labels = ['Mã SKU', 'Mã vạch', 'Tên hàng hóa', 'ĐVT', 'Giá mua'];
  sheet.getCell(1, 1).value = 'MS_030';
  fillSheetRow(sheet, 2, keys);
  fillSheetRow(sheet, 3, keys.map(() => ''));
  fillSheetRow(sheet, 4, labels);
  rows.forEach((data, index) => {
    fillSheetRow(
      sheet,
      5 + index,
      keys.map((k) => data[k] ?? ''),
    );
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe('ExcelParserService', () => {
  const service = new ExcelParserService();

  it('parses data rows from sheet 1 starting at row 5', async () => {
    const buffer = await buildSampleWorkbookBuffer([
      {
        [InventoryImportExcelField.SKU_CODE]: 'ABC-001',
        [InventoryImportExcelField.BAR_CODE]: '8930001',
        [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Giày thể thao',
        [InventoryImportExcelField.UNIT_NAME]: 'Đôi',
        [InventoryImportExcelField.COST_PRICE]: '100.000',
      },
    ]);

    const rows = await service.parseInventoryItemsWorkbook(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0][InventoryImportExcelField.SKU_CODE]).toBe('ABC-001');
    expect(rows[0][InventoryImportExcelField.INVENTORY_ITEM_NAME]).toBe('Giày thể thao');
    expect(rows[0][InventoryImportExcelField.COST_PRICE]).toBe('100.000');
  });

  it('reads SKU from column A when headers start at column A', async () => {
    const buffer = await buildSampleWorkbookBuffer([
      {
        [InventoryImportExcelField.SKU_CODE]: 'COL-A-001',
        [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Test',
        [InventoryImportExcelField.UNIT_NAME]: 'Cái',
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet('Danh sách hàng hóa')!;
    expect(sheet.getCell(2, 1).value).toBe(InventoryImportExcelField.SKU_CODE);
    expect(sheet.getCell(5, 1).value).toBe('COL-A-001');

    const rows = await service.parseInventoryItemsWorkbook(buffer);
    expect(rows[0][InventoryImportExcelField.SKU_CODE]).toBe('COL-A-001');
  });

  it('skips completely empty rows', async () => {
    const buffer = await buildSampleWorkbookBuffer([
      {
        [InventoryImportExcelField.SKU_CODE]: 'A',
        [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Item A',
        [InventoryImportExcelField.UNIT_NAME]: 'Cái',
      },
      {},
      {
        [InventoryImportExcelField.SKU_CODE]: 'B',
        [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Item B',
        [InventoryImportExcelField.UNIT_NAME]: 'Cái',
      },
    ]);

    const rows = await service.parseInventoryItemsWorkbook(buffer);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r[InventoryImportExcelField.SKU_CODE])).toEqual(['A', 'B']);
  });
});
