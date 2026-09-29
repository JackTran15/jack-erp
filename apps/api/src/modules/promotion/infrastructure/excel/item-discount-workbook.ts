import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PromotionDiscountMode } from '@erp/shared-interfaces';
import { applyWorkbookFont } from '../../../../common/utils/excel-workbook-font.util';

/** Phương thức giảm giá có nhập/xuất Excel: mỗi phương thức một sheet (ADR-01). */
export type ItemDiscountWorkbookMethod =
  | PromotionDiscountMode.PERCENT
  | PromotionDiscountMode.AMOUNT
  | PromotionDiscountMode.FIXED_PRICE;

/** Phương thức có cột giá trị trong sheet. */
type ItemDiscountValueMethod = PromotionDiscountMode.PERCENT | PromotionDiscountMode.AMOUNT;

/**
 * Một dòng xuất ra file. `value` chỉ ghi ở sheet có cột giá trị.
 * `unit` / `sellingPrice` không còn được xuất (AC-12); giữ optional để handler cũ còn biên dịch.
 */
export interface ItemDiscountWorkbookLine {
  code: string;
  name: string;
  unit?: string | null;
  sellingPrice?: number | null;
  value?: number | null;
}

export interface ItemDiscountSheet {
  method: ItemDiscountWorkbookMethod;
  /** Tên sheet trong file. */
  name: string;
  /** Tiêu đề cột giá trị; `null` khi sheet không có cột giá trị (Đồng giá, A-01). */
  valueHeader: string | null;
}

/** Nguồn duy nhất của bố cục file cho cả `build` và `parse`, theo thứ tự sheet (ADR-01, A-06). */
export const ITEM_DISCOUNT_SHEETS: readonly ItemDiscountSheet[] = [
  { method: PromotionDiscountMode.PERCENT, name: 'Giảm giá theo %', valueHeader: '% giảm giá' },
  { method: PromotionDiscountMode.AMOUNT, name: 'Giảm giá theo số tiền', valueHeader: 'Số tiền giảm' },
  { method: PromotionDiscountMode.FIXED_PRICE, name: 'Đồng giá', valueHeader: null },
];

const CODE_HEADER = 'Mã SKU*';
const NAME_HEADER = 'Tên hàng hóa';
/** Độ rộng cột theo thứ tự: mã, tên, giá trị. */
const COLUMN_WIDTHS = [18, 36, 16];

export function itemDiscountSheet(method: ItemDiscountWorkbookMethod): ItemDiscountSheet {
  return ITEM_DISCOUNT_SHEETS.find((sheet) => sheet.method === method)!;
}

export function itemDiscountValueHeader(method: ItemDiscountWorkbookMethod): string | null {
  return itemDiscountSheet(method).valueHeader;
}

/** Tiêu đề cột của sheet: `Mã SKU*`, `Tên hàng hóa`, rồi cột giá trị nếu có. */
export function itemDiscountHeaders(method: ItemDiscountWorkbookMethod): string[] {
  const valueHeader = itemDiscountValueHeader(method);
  return valueHeader === null ? [CODE_HEADER, NAME_HEADER] : [CODE_HEADER, NAME_HEADER, valueHeader];
}

/** Chuẩn hoá tiêu đề để so khớp khi nhập: bỏ `*`, trim, không phân biệt hoa thường. */
export function normalizeItemDiscountHeader(header: string): string {
  return header.replace(/\*/g, '').trim().toLowerCase();
}

function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Dựng file `.xlsx` đủ 3 sheet theo `ITEM_DISCOUNT_SHEETS`. Chỉ sheet của `method` có dòng dữ liệu,
 * giữ đúng thứ tự `lines`; hai sheet kia chỉ có hàng tiêu đề (A-07). `lines: []` là file mẫu.
 */
export async function buildItemDiscountWorkbook(
  method: ItemDiscountWorkbookMethod,
  lines: ItemDiscountWorkbookLine[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const def of ITEM_DISCOUNT_SHEETS) {
    const sheet = workbook.addWorksheet(def.name);
    const headers = itemDiscountHeaders(def.method);
    sheet.columns = headers.map((_, i) => ({ width: COLUMN_WIDTHS[i] }));

    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };

    if (def.method !== method) continue;
    for (const line of lines) {
      sheet.addRow(
        def.valueHeader === null
          ? [line.code, line.name]
          : [line.code, line.name, toNumber(line.value) ?? null],
      );
    }
  }

  applyWorkbookFont(workbook);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** Giới hạn dòng dữ liệu của một lần nhập khẩu đồng bộ (ADR-01, A-09). */
export const ITEM_DISCOUNT_IMPORT_MAX_ROWS = 2000;

/** Một dòng đọc từ file: chưa kiểm tra giá trị, chưa tra mã. */
export interface ItemDiscountWorkbookRow {
  /** Số dòng Excel (hàng tiêu đề = 1). */
  rowNumber: number;
  /** Mã SKU đã trim; `''` khi ô trống. */
  code: string;
  /** Giá trị thô của ô cột giá trị: số, chuỗi, `null`, ... Luôn `null` với `FIXED_PRICE`. */
  rawValue: unknown;
}

const OTHER_METHOD: Record<ItemDiscountValueMethod, ItemDiscountValueMethod> = {
  [PromotionDiscountMode.PERCENT]: PromotionDiscountMode.AMOUNT,
  [PromotionDiscountMode.AMOUNT]: PromotionDiscountMode.PERCENT,
};

const METHOD_LABEL: Record<ItemDiscountValueMethod, string> = {
  [PromotionDiscountMode.PERCENT]: '%',
  [PromotionDiscountMode.AMOUNT]: 'số tiền',
};

/** Giá trị gốc của ô: bỏ lớp công thức / rich text / hyperlink. */
function unwrapCellValue(value: ExcelJS.CellValue | undefined): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || value instanceof Date) return value;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    return unwrapCellValue((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  }
  if ('hyperlink' in value) return unwrapCellValue(value.text as ExcelJS.CellValue);
  if ('error' in value) return value.error;
  return null;
}

function cellText(value: ExcelJS.CellValue | undefined): string {
  const raw = unwrapCellValue(value);
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function isEmptyRaw(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

/**
 * Chọn sheet theo ADR-02: tên (trim, không phân biệt hoa thường) trùng sheet của `method`;
 * không có mà file chỉ có một sheet thì dùng sheet đó (mẫu cũ, A-05); còn lại 400 (A-08).
 */
function pickSheet(workbook: ExcelJS.Workbook, method: ItemDiscountWorkbookMethod): ExcelJS.Worksheet {
  const target = itemDiscountSheet(method).name;
  const key = target.trim().toLowerCase();
  const byName = workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === key);
  if (byName) return byName;
  if (workbook.worksheets.length === 1) return workbook.worksheets[0];
  throw new BadRequestException(`File không có sheet '${target}'`);
}

/**
 * Đọc file nhập khẩu: chọn sheet theo phương thức (ADR-02), tìm cột `Mã SKU` + cột giá trị theo
 * tiêu đề đã chuẩn hoá ở hàng 1, bỏ dòng trống. `FIXED_PRICE` chỉ cần cột mã, cột giá trị nếu có
 * thì bỏ qua và `rawValue` luôn `null` (A-10). Lỗi mức file ném 400 theo bảng lỗi của design.
 */
export async function parseItemDiscountWorkbook(
  buffer: Buffer,
  method: ItemDiscountWorkbookMethod,
): Promise<ItemDiscountWorkbookRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('File không đúng định dạng .xlsx');
  }
  if (workbook.worksheets.length === 0) throw new BadRequestException('File không đúng định dạng .xlsx');
  const sheet = pickSheet(workbook, method);

  const columnByHeader = new Map<string, number>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeItemDiscountHeader(cellText(cell.value));
    if (header && !columnByHeader.has(header)) columnByHeader.set(header, colNumber);
  });

  const codeCol = columnByHeader.get(normalizeItemDiscountHeader(CODE_HEADER));
  if (codeCol === undefined) {
    throw new BadRequestException(`File thiếu cột '${normalizeHeaderLabel(CODE_HEADER)}'`);
  }

  let valueCol: number | undefined;
  if (method !== PromotionDiscountMode.FIXED_PRICE) {
    const valueHeader = itemDiscountValueHeader(method)!;
    valueCol = columnByHeader.get(normalizeItemDiscountHeader(valueHeader));
    if (valueCol === undefined) {
      const otherHeader = itemDiscountValueHeader(OTHER_METHOD[method])!;
      if (columnByHeader.has(normalizeItemDiscountHeader(otherHeader))) {
        throw new BadRequestException(
          `File có cột '${otherHeader}' nhưng chương trình đang giảm theo ${METHOD_LABEL[method]}`,
        );
      }
      throw new BadRequestException(`File thiếu cột '${valueHeader}'`);
    }
  }

  const rows: ItemDiscountWorkbookRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = cellText(row.getCell(codeCol).value);
    const rawValue = valueCol === undefined ? null : unwrapCellValue(row.getCell(valueCol).value);
    if (code === '' && isEmptyRaw(rawValue)) return;
    rows.push({ rowNumber, code, rawValue });
  });

  if (rows.length > ITEM_DISCOUNT_IMPORT_MAX_ROWS) {
    throw new BadRequestException('File vượt quá 2.000 dòng');
  }
  return rows;
}

/** Tên cột hiển thị trong thông báo: bỏ dấu `*` bắt buộc. */
function normalizeHeaderLabel(header: string): string {
  return header.replace(/\*/g, '').trim();
}
