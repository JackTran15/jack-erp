import { INVOICE_REPORT_COLUMN_LABELS_VI } from '@erp/shared-interfaces';
import {
  INVOICE_REPORT_SUMMARY_COLUMNS,
  isAcceptedColumnKey,
  isDynamicColumnKey,
  isKnownSummaryColumn,
  parseDynamicColumnKey,
} from './invoice-report.columns';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('invoice-report.columns', () => {
  it('every fixed column has a VI label (registry ⟷ labels in sync)', () => {
    for (const c of INVOICE_REPORT_SUMMARY_COLUMNS) {
      expect(INVOICE_REPORT_COLUMN_LABELS_VI[c.key]).toBeDefined();
    }
  });

  it('isKnownSummaryColumn', () => {
    expect(isKnownSummaryColumn('revenue.goods')).toBe(true);
    expect(isKnownSummaryColumn('revenue.total')).toBe(true);
    expect(isKnownSummaryColumn('nope')).toBe(false);
  });

  it('isDynamicColumnKey / parseDynamicColumnKey', () => {
    expect(isDynamicColumnKey(`payment.method.${UUID}`)).toBe(true);
    expect(isDynamicColumnKey('payment.method.notuuid')).toBe(false);
    expect(parseDynamicColumnKey(`payment.method.${UUID}`)).toEqual({
      accountId: UUID,
    });
    expect(parseDynamicColumnKey('revenue.goods')).toBeNull();
  });

  it('isAcceptedColumnKey covers fixed + dynamic, rejects garbage', () => {
    expect(isAcceptedColumnKey('revenue.total')).toBe(true);
    expect(isAcceptedColumnKey(`payment.method.${UUID}`)).toBe(true);
    expect(isAcceptedColumnKey('bogus')).toBe(false);
  });
});
