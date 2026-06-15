import { REPORT_TYPE_LABELS_VI } from '@erp/shared-interfaces';

export interface ReportTypeSeed {
  key: string;
  name: string;
  sortOrder: number;
}

type ReportTypeDefinition = Pick<ReportTypeSeed, 'key' | 'sortOrder'>;

/**
 * Report-type catalogue. Each `key` MUST match a ReportDefinition registered in
 * the ReportRegistry (invoice-report.module.ts) — a seeded key without a code
 * definition would list in the picker but 500 when run. Add a new report:
 * register its ReportDefinition, add its key here, add its VI label to
 * REPORT_TYPE_LABELS_VI (shared-interfaces).
 */
const REPORT_TYPE_DEFINITIONS: ReportTypeDefinition[] = [
  { key: 'daily-sales-summary', sortOrder: 10 },
  { key: 'invoice-order-listing', sortOrder: 20 },
  { key: 'invoice-item-revenue-detail', sortOrder: 30 },
  { key: 'revenue-by-item', sortOrder: 40 },
];

export const REPORT_TYPE_SEEDS: ReportTypeSeed[] = REPORT_TYPE_DEFINITIONS.map(
  (def) => ({
    ...def,
    name: REPORT_TYPE_LABELS_VI[def.key] ?? def.key,
  }),
);
