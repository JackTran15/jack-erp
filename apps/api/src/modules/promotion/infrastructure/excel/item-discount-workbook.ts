import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PromotionDiscountMode } from '@erp/shared-interfaces';
import { applyWorkbookFont } from '../../../../common/utils/excel-workbook-font.util';

/** Phương thức giảm giá có nhập/xuất Excel. `FIXED_PRICE` không có (ADR-04). */
export type ItemDiscountWorkbookMethod =
  | PromotionDiscountMode.PERCENT
  | PromotionDiscountMode.AMOUNT;

/** Một dòng xuất ra file. Trống `sellingPrice` hoặc `value` thì ô giá KM để trống. */
export interface ItemDiscountWorkbookLine {
  code: string;
  name: string;
  unit?: string | null;
  sellingPrice?: number | null;
  value?: number | null;
}

export type ItemDiscountColumnKey =
  | 'code'
  | 'name'
  | 'unit'
  | 'sellingPrice'
  | 'value'
  | 'promoPrice';

export interface ItemDiscountColumn {
  key: ItemDiscountColumnKey;
  /** Tiêu đề cố định; cột `value` lấy theo phương thức qua `itemDiscountValueHeader`. */
  header?: string;
  width: number;
}

/** Định nghĩa cột duy nhất cho cả `build` và `parse` (ADR-04, A-10). */
export const ITEM_DISCOUNT_COLUMNS: readonly ItemDiscountColumn[] = [
  { key: 'code', header: 'Mã SKU*', width: 18 },
  { key: 'name', header: 'Tên hàng hóa', width: 36 },
  { key: 'unit', header: 'Đơn vị tính', width: 14 },
  { key: 'sellingPrice', header: 'Giá bán', width: 14 },
  { key: 'value', width: 16 },
  { key: 'promoPrice', header: 'Giá khuyến mại', width: 16 },
];

const VALUE_HEADER_BY_METHOD: Record<ItemDiscountWorkbookMethod, string> = {
  [PromotionDiscountMode.PERCENT]: '% giảm giá',
  [PromotionDiscountMode.AMOUNT]: 'Số tiền giảm',
};

export function itemDiscountValueHeader(method: ItemDiscountWorkbookMethod): string {
  return VALUE_HEADER_BY_METHOD[method];
}

export function itemDiscountHeaders(method: ItemDiscountWorkbookMethod): string[] {
  return ITEM_DISCOUNT_COLUMNS.map((col) => col.header ?? itemDiscountValueHeader(method));
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

export function itemDiscountPromoPrice(
  method: ItemDiscountWorkbookMethod,
  sellingPrice: number | null | undefined,
  value: number | null | undefined,
): number | undefined {
  const price = toNumber(sellingPrice);
  const v = toNumber(value);
  if (price === undefined || v === undefined) return undefined;
  return method === PromotionDiscountMode.PERCENT
    ? Math.round(price * (1 - v / 100))
    : Math.max(0, price - v);
}

/** Dựng file `.xlsx`: hàng 1 là tiêu đề, các dòng sau giữ đúng thứ tự `lines`. */
export async function buildItemDiscountWorkbook(
  method: ItemDiscountWorkbookMethod,
  lines: ItemDiscountWorkbookLine[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.columns = ITEM_DISCOUNT_COLUMNS.map((col) => ({ width: col.width }));

  const headerRow = sheet.addRow(itemDiscountHeaders(method));
  headerRow.font = { bold: true };

  for (const line of lines) {
    sheet.addRow([
      line.code,
      line.name,
      line.unit ?? null,
      toNumber(line.sellingPrice) ?? null,
      toNumber(line.value) ?? null,
      itemDiscountPromoPrice(method, line.sellingPrice, line.value) ?? null,
    ]);
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
  /** Giá trị thô của ô cột giá trị: số, chuỗi, `null`, ... */
  rawValue: unknown;
}

const OTHER_METHOD: Record<ItemDiscountWorkbookMethod, ItemDiscountWorkbookMethod> = {
  [PromotionDiscountMode.PERCENT]: PromotionDiscountMode.AMOUNT,
  [PromotionDiscountMode.AMOUNT]: PromotionDiscountMode.PERCENT,
};

const METHOD_LABEL: Record<ItemDiscountWorkbookMethod, string> = {
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
 * Đọc file nhập khẩu: tìm cột `Mã SKU` + cột giá trị theo tiêu đề đã chuẩn hoá ở hàng 1
 * (ADR-04), bỏ dòng trống. Lỗi mức file ném 400 theo bảng lỗi của design.
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
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('File không đúng định dạng .xlsx');

  const columnByHeader = new Map<string, number>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeItemDiscountHeader(cellText(cell.value));
    if (header && !columnByHeader.has(header)) columnByHeader.set(header, colNumber);
  });

  const codeHeader = ITEM_DISCOUNT_COLUMNS.find((col) => col.key === 'code')!.header!;
  const codeCol = columnByHeader.get(normalizeItemDiscountHeader(codeHeader));
  if (codeCol === undefined) {
    throw new BadRequestException(`File thiếu cột '${normalizeHeaderLabel(codeHeader)}'`);
  }

  const valueHeader = itemDiscountValueHeader(method);
  const valueCol = columnByHeader.get(normalizeItemDiscountHeader(valueHeader));
  if (valueCol === undefined) {
    const otherHeader = itemDiscountValueHeader(OTHER_METHOD[method]);
    if (columnByHeader.has(normalizeItemDiscountHeader(otherHeader))) {
      throw new BadRequestException(
        `File có cột '${otherHeader}' nhưng chương trình đang giảm theo ${METHOD_LABEL[method]}`,
      );
    }
    throw new BadRequestException(`File thiếu cột '${valueHeader}'`);
  }

  const rows: ItemDiscountWorkbookRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = cellText(row.getCell(codeCol).value);
    const rawValue = unwrapCellValue(row.getCell(valueCol).value);
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
