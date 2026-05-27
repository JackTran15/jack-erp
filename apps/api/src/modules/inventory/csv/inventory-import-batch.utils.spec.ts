import {
  INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
  INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE,
  INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE,
  INVENTORY_IMPORT_VALIDATE_BATCH_SIZE,
} from '@erp/shared-interfaces';

describe('inventory import batch constants', () => {
  it('uses stable batch sizes for large-file imports', () => {
    expect(INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE).toBe(100);
    expect(INVENTORY_IMPORT_VALIDATE_BATCH_SIZE).toBe(500);
    expect(INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE).toBe(1000);
    expect(INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT).toBe(200);
  });
});
