import type { InventoryImportExcelRow } from '@erp/shared-interfaces';
import { InventoryImportExcelField } from '@erp/shared-interfaces';
import { parseSemicolonDelimitedGrid } from './import-workbook/semicolon-grid.utils';
import { parseInventoryItemsFromGrid } from './inventory-import-grid.parser';

/**
 * Parse delimited text export that follows the standard 4-header grid:
 * - delimiter: `;`
 * - UTF-8 text
 * - quote-aware, supports newlines within quoted fields
 *
 * Layout:
 * - Row with keys contains `SKUCode` (EN key)
 * - Data starts 3 rows below keys row.
 */
export function parseInventoryItemsFromDelimitedText(
  text: string,
): InventoryImportExcelRow[] {
  const grid = parseSemicolonDelimitedGrid(text);

  // Find keys row (EN keys): the row containing `SKUCode`.
  const keysRowIndex0Based = grid.findIndex((row) =>
    row.some((cell) => cellToTrim(cell) === InventoryImportExcelField.SKU_CODE),
  );

  if (keysRowIndex0Based < 0) {
    // Delegate consistent error message.
    return parseInventoryItemsFromGrid(grid, 2, 5);
  }

  const headerKeyRowIndex1Based = keysRowIndex0Based + 1;
  const dataStartRowIndex1Based = headerKeyRowIndex1Based + 3;

  return parseInventoryItemsFromGrid(
    grid,
    headerKeyRowIndex1Based,
    dataStartRowIndex1Based,
  );
}

function cellToTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

