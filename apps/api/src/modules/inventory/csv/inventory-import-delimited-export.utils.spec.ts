import {
  INVENTORY_IMPORT_EXCEL_TEMPLATE_VERSION,
  InventoryImportExcelField,
} from '@erp/shared-interfaces';
import {
  buildInventoryImportDelimitedCsv,
  INVENTORY_IMPORT_ERROR_COLUMN_KEY,
  INVENTORY_IMPORT_ERROR_COLUMN_LABEL,
} from './inventory-import-delimited-export.utils';
describe('buildInventoryImportDelimitedCsv', () => {
  it('emits the same 4-row header grid as items CSV export', async () => {
    const sampleRow = {
      [InventoryImportExcelField.SKU_CODE]: 'SKU-1',
      [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Giày A',
      [InventoryImportExcelField.COST_PRICE]: '350.000',
    };

    const built = buildInventoryImportDelimitedCsv([{ rawData: sampleRow }]);
    const lines = built.split('\n');

    expect(lines[0].startsWith(INVENTORY_IMPORT_EXCEL_TEMPLATE_VERSION)).toBe(true);
    expect(lines[1]).toContain('SKUCode');
    expect(lines[1]).toContain('InventoryItemName');
    expect(lines[2]).toContain('THÔNG TIN HÀNG HÓA');
    expect(lines[3]).toContain('Mã SKU');
    expect(lines[3]).toContain('Tên hàng hóa');
    expect(lines[4]).toContain('SKU-1');
    expect(lines[4]).toContain('350.000');
  });

  it('adds trailing error column for import error export', () => {
    const built = buildInventoryImportDelimitedCsv(
      [
        {
          rawData: {
            [InventoryImportExcelField.SKU_CODE]: 'DUP-1',
          },
          extraCell: 'Mã SKU đã tồn tại',
        },
      ],
      {
        extraColumnKey: INVENTORY_IMPORT_ERROR_COLUMN_KEY,
        extraColumnLabel: INVENTORY_IMPORT_ERROR_COLUMN_LABEL,
      },
    );
    const lines = built.split('\n');

    expect(lines[1]).toContain(INVENTORY_IMPORT_ERROR_COLUMN_KEY);
    expect(lines[3]).toContain(INVENTORY_IMPORT_ERROR_COLUMN_LABEL);
    expect(lines[4]).toContain('Mã SKU đã tồn tại');
  });
});
