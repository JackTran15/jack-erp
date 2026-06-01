import { BadRequestException } from '@nestjs/common';
import type { InventoryImportExcelRow } from '@erp/shared-interfaces';
import { InventoryImportExcelField } from '@erp/shared-interfaces';
import { cellToString } from './inventory-excel-parse.utils';

/**
 * Parse inventory items rows from a grid representation (sheet_to_json with `header: 1`).
 * The canonical layout is:
 *  - Row 2 (1-based): keys (EN) across columns
 *  - Row 5 (1-based): data starts
 *
 * This parser ignores group header / label rows (styling only).
 */
export function parseInventoryItemsFromGrid(
  grid: (string | number)[][],
  headerKeyRowIndex1Based = 2,
  dataStartRowIndex1Based = 5,
): InventoryImportExcelRow[] {
  const keysRow = grid[headerKeyRowIndex1Based - 1] ?? [];

  const keys: string[] = [];
  keysRow.forEach((cell, colIndex) => {
    keys[colIndex] = cellToString(cell);
  });

  assertHeaderRowHasSkuKey(keys, headerKeyRowIndex1Based);

  const rows: InventoryImportExcelRow[] = [];
  for (let i = dataStartRowIndex1Based - 1; i < grid.length; i++) {
    const line = grid[i] ?? [];
    const raw: InventoryImportExcelRow = {};
    let hasValue = false;

    keys.forEach((key, colIndex) => {
      if (!key?.trim()) return;
      const value = cellToString(line[colIndex]);
      if (value) hasValue = true;
      raw[key.trim()] = value;
    });

    if (!hasValue) continue;
    if (
      !raw[InventoryImportExcelField.SKU_CODE]?.trim() &&
      !raw[InventoryImportExcelField.INVENTORY_ITEM_NAME]?.trim()
    ) {
      continue;
    }

    rows.push(raw);
  }

  if (rows.length === 0) {
    throw new BadRequestException(
      'Tệp dữ liệu không có dòng dữ liệu hợp lệ. Điền ít nhất một dòng từ dòng dữ liệu trên file.',
    );
  }

  return rows;
}

function assertHeaderRowHasSkuKey(
  keys: string[],
  headerKeyRowIndex1Based: number,
): void {
  const canonicalKeys = keys.map((k) => k.trim()).filter(Boolean);
  if (!canonicalKeys.includes(InventoryImportExcelField.SKU_CODE)) {
    throw new BadRequestException(
      `Sheet dữ liệu không đúng định dạng (thiếu hàng key ${InventoryImportExcelField.SKU_CODE} ở dòng ${headerKeyRowIndex1Based})`,
    );
  }
}

