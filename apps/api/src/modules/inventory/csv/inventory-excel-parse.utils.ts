import {
  InventoryImportExcelField,
  type InventoryImportExcelRow,
} from '@erp/shared-interfaces';

/** Normalized cell values that mean "yes" (Có, yes, 1, …). */
const YES_FLAG_VALUES = ['có', 'co', 'yes', '1'] as const;

/** Normalized cell values that mean "no" (Không, no, 0, …). */
const NO_FLAG_VALUES = ['không', 'khong', 'no', '0'] as const;

function normalizeFlagValue(value: string): string {
  return value.trim().toLowerCase();
}

function isYesFlag(normalized: string): boolean {
  return YES_FLAG_VALUES.some((token) => token === normalized);
}

function isNoFlag(normalized: string): boolean {
  return NO_FLAG_VALUES.some((token) => token === normalized);
}

/**
 * Parse numbers from import cells or DB decimals.
 * - `350.000` (VN thousands) → 350000
 * - `350000.00` (SQL decimal) → 350000
 */
export function parseGroupedDecimal(
  value: string | undefined,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  if (/^\d+,\d+$/.test(trimmed)) {
    const n = Number(trimmed.replace(',', '.'));
    if (Number.isNaN(n) || n < 0) return undefined;
    return n;
  }

  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    const last = parts[parts.length - 1] ?? '';
    if (last.length <= 2) {
      const n = Number(trimmed);
      if (Number.isNaN(n) || n < 0) return undefined;
      return n;
    }
    const n = Number(parts.join(''));
    if (Number.isNaN(n) || n < 0) return undefined;
    return n;
  }

  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

/** Format for Excel/CSV export: `350000` → `350.000` (MISA-style). */
export function formatInventoryImportGroupedNumber(value: number): string {
  const int = Math.trunc(value);
  if (!Number.isFinite(int)) return '';
  const negative = int < 0;
  const abs = Math.abs(int);
  const grouped = abs
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return negative ? `-${grouped}` : grouped;
}

export function parseGroupedInteger(
  value: string | undefined,
): number | undefined {
  const n = parseGroupedDecimal(value);
  if (n === undefined) return undefined;
  const int = Math.trunc(n);
  return Number.isFinite(int) ? int : undefined;
}

/** Yes/no flag column: empty → default; recognized tokens → boolean. */
export function parseYesNoFlag(
  value: string | undefined,
  defaultValue = true,
): boolean {
  const normalized = normalizeFlagValue(value ?? '');
  if (!normalized) return defaultValue;
  if (isYesFlag(normalized)) return true;
  if (isNoFlag(normalized)) return false;
  return defaultValue;
}

/** Inactive column: "yes" means item is inactive (`isActive` false). */
export function parseIsActiveFromInactiveColumn(
  value: string | undefined,
): boolean {
  const normalized = normalizeFlagValue(value ?? '');
  if (!normalized) return true;
  if (isYesFlag(normalized)) return false;
  return true;
}

export function isExcelFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

/** Office Open XML (.xlsx) — ZIP archive. */
export function isZipExcelBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  );
}

/** Excel 97–2003 binary (.xls) — OLE compound document. */
export function isOleExcelBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

export function isCsvFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.csv');
}

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value) {
      return String((value as { text?: string }).text ?? '').trim();
    }
    if ('richText' in value) {
      const richText = (value as { richText?: Array<{ text?: string }> })
        .richText;
      return (richText ?? [])
        .map((part) => String(part.text ?? ''))
        .join('')
        .trim();
    }
  }
  if (typeof value === 'number') return String(value);
  return String(value).trim();
}

export function getExcelField(
  row: InventoryImportExcelRow,
  key: InventoryImportExcelField,
): string {
  return (row[key] ?? '').trim();
}
