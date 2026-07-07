import { ColumnFilter, ReportCellValue } from '@erp/shared-interfaces';

/** True when `f` carries any text operator (string-column filters). */
export function hasTextOperator(f: ColumnFilter): boolean {
  return (
    f.contains !== undefined ||
    f.equals !== undefined ||
    f.startsWith !== undefined ||
    f.endsWith !== undefined ||
    f.notContains !== undefined
  );
}

/** Post-aggregate predicate for a per-column filter. All operators present in `f` must hold (AND). */
export function matchColumnFilter(value: ReportCellValue, f: ColumnFilter): boolean {
  // String/text column (or a text operator targeting an empty cell).
  if (typeof value === 'string' || hasTextOperator(f)) {
    const s = String(value ?? '');
    const lower = s.toLowerCase();
    // date / string column — yyyy-mm-dd sorts lexicographically
    if (f.from !== undefined && s < f.from) return false;
    if (f.to !== undefined && s > f.to) return false;
    if (f.eq !== undefined && s !== String(f.eq)) return false;
    if (f.equals !== undefined && s !== f.equals) return false;
    if (f.contains !== undefined && !lower.includes(f.contains.toLowerCase())) return false;
    if (f.startsWith !== undefined && !s.startsWith(f.startsWith)) return false;
    if (f.endsWith !== undefined && !s.endsWith(f.endsWith)) return false;
    if (f.notContains !== undefined && lower.includes(f.notContains.toLowerCase())) {
      return false;
    }
    return true;
  }
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  if (f.eq !== undefined && n !== Number(f.eq)) return false;
  if (f.lt !== undefined && !(n < f.lt)) return false;
  if (f.lte !== undefined && !(n <= f.lte)) return false;
  if (f.gt !== undefined && !(n > f.gt)) return false;
  if (f.gte !== undefined && !(n >= f.gte)) return false;
  return true;
}
