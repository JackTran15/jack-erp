import { ReportColumnDataType } from '@erp/shared-interfaces';

/** Column registry for `business-results` — 5 fixed columns, ~21 fixed "Khoản mục" rows. */
export interface BusinessResultsColumnDef {
  key: string;
  type: ReportColumnDataType;
}

export const BUSINESS_RESULTS_COLUMNS: BusinessResultsColumnDef[] = [
  { key: 'khoanMuc', type: ReportColumnDataType.STRING },
  { key: 'kyTruoc', type: ReportColumnDataType.CURRENCY },
  { key: 'kyHienTai', type: ReportColumnDataType.CURRENCY },
  { key: 'thayDoiPercent', type: ReportColumnDataType.PERCENT },
  { key: 'thayDoiSoTien', type: ReportColumnDataType.CURRENCY },
];

const BY_KEY = new Map(BUSINESS_RESULTS_COLUMNS.map((c) => [c.key, c]));

export const isKnownBusinessResultsColumn = (key: string): boolean => BY_KEY.has(key);
