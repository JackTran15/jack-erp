import { Injectable, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { InventoryImportExcelField } from '@erp/shared-interfaces';
import type { InventoryImportExcelRow } from '@erp/shared-interfaces';
import {
  cellToString,
  isOleExcelBuffer,
  isZipExcelBuffer,
} from './inventory-excel-parse.utils';
import { parseInventoryItemsFromGrid } from './inventory-import-grid.parser';

const DATA_SHEET_NAMES = ['Danh sách hàng hóa', 'Danh sach hang hoa'];
const HEADER_KEY_ROW_INDEX = 2; // 1-based row 2
const DATA_START_ROW_INDEX = 5; // 1-based row 5

@Injectable()
export class ExcelParserService {
  async parseInventoryItemsWorkbook(buffer: Buffer): Promise<InventoryImportExcelRow[]> {
    if (!buffer?.length) {
      throw new BadRequestException('Tệp Excel rỗng hoặc không hợp lệ');
    }

    if (isZipExcelBuffer(buffer)) {
      return this.parseXlsxBuffer(buffer);
    }
    if (isOleExcelBuffer(buffer)) {
      return this.parseXlsBuffer(buffer);
    }

    throw new BadRequestException(
      'Định dạng tệp không hợp lệ. Vui lòng dùng file Excel .xlsx hoặc .xls (file Excel mẫu nhập khẩu hàng hóa).',
    );
  }

  private async parseXlsxBuffer(buffer: Buffer): Promise<InventoryImportExcelRow[]> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as never);
    } catch {
      throw new BadRequestException(
        'Không đọc được tệp Excel .xlsx. Vui lòng kiểm tra lại file Excel mẫu nhập khẩu hàng hóa.',
      );
    }

    let sheet = this.findDataSheetName((name) => workbook.getWorksheet(name));
    if (!sheet) {
      sheet = workbook.worksheets.find((ws) =>
        ws.name.toLowerCase().includes('danh sach hang'),
      );
    }
    if (!sheet) {
      sheet = workbook.worksheets[0];
    }
    if (!sheet) {
      throw new BadRequestException('Tệp Excel không có sheet dữ liệu');
    }

    const keys: string[] = [];
    sheet.getRow(HEADER_KEY_ROW_INDEX).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      keys[colNumber - 1] = cellToString(cell.value);
    });

    this.assertHeaderRowHasSkuKey(keys);

    const rows: InventoryImportExcelRow[] = [];
    for (let rowIndex = DATA_START_ROW_INDEX; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex);
      const raw: InventoryImportExcelRow = {};
      let hasValue = false;

      keys.forEach((key, colIndex) => {
        if (!key?.trim()) return;
        const value = cellToString(row.getCell(colIndex + 1).value);
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

    return this.ensureRowsParsed(rows);
  }

  private parseXlsBuffer(buffer: Buffer): InventoryImportExcelRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('password-protected')) {
        throw new BadRequestException(
          'Tệp Excel có mật khẩu hoặc được mã hóa. Vui lòng xuất lại file không bảo vệ mật khẩu (hoặc dùng «Tải tệp mẫu» trên màn hình nhập khẩu).',
        );
      }
      throw new BadRequestException(
        'Không đọc được tệp Excel .xls. Vui lòng kiểm tra lại file Excel mẫu nhập khẩu hàng hóa.',
      );
    }

    const sheetName = this.pickXlsSheetName(workbook.SheetNames);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new BadRequestException('Tệp Excel không có sheet dữ liệu');
    }

    const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    return parseInventoryItemsFromGrid(
      grid,
      HEADER_KEY_ROW_INDEX,
      DATA_START_ROW_INDEX,
    );
  }

  private parseRowsFromGrid(grid: (string | number)[][]): InventoryImportExcelRow[] {
    const keysRow = grid[HEADER_KEY_ROW_INDEX - 1] ?? [];
    const keys: string[] = [];
    keysRow.forEach((cell, colIndex) => {
      keys[colIndex] = cellToString(cell);
    });

    this.assertHeaderRowHasSkuKey(keys);

    const rows: InventoryImportExcelRow[] = [];
    for (let i = DATA_START_ROW_INDEX - 1; i < grid.length; i++) {
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

    return this.ensureRowsParsed(rows);
  }

  private assertHeaderRowHasSkuKey(keys: string[]): void {
    const canonicalKeys = keys.map((k) => k.trim()).filter(Boolean);
    if (!canonicalKeys.includes(InventoryImportExcelField.SKU_CODE)) {
      throw new BadRequestException(
        `Sheet dữ liệu không đúng định dạng (thiếu hàng key ${InventoryImportExcelField.SKU_CODE} ở dòng 2)`,
      );
    }
  }

  private ensureRowsParsed(rows: InventoryImportExcelRow[]): InventoryImportExcelRow[] {
    if (rows.length === 0) {
      throw new BadRequestException(
        'Tệp Excel không có dòng dữ liệu hợp lệ. Điền ít nhất một dòng từ dòng 5 (có Mã SKU hoặc Tên hàng hóa).',
      );
    }
    return rows;
  }

  private findDataSheetName<T>(
    getSheet: (name: string) => T | undefined,
  ): T | undefined {
    for (const name of DATA_SHEET_NAMES) {
      const found = getSheet(name);
      if (found) return found;
    }
    return undefined;
  }

  private pickXlsSheetName(sheetNames: string[]): string {
    const matched = this.findDataSheetName((name) =>
      sheetNames.includes(name) ? name : undefined,
    );
    if (matched) return matched;

    const fuzzy = sheetNames.find((name) =>
      name.toLowerCase().includes('danh sach hang'),
    );
    return fuzzy ?? sheetNames[0];
  }
}
