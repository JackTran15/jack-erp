import { DocumentNumberingService } from '../../../../document-numbering/document-numbering.service';
import { ResetPolicy } from '../../../../document-numbering/document-number-rule.entity';
import {
  computeResetKey,
  formatDate,
  formatDocumentNumber,
  DocumentNumberRuleShape,
} from './document-number-format';

/**
 * Official spec for T-02-06 (AC-14). `computeResetKey`, `formatDocumentNumber`
 * and `formatDate` in document-number-format.ts are a byte-for-byte port of
 * private methods on `DocumentNumberingService` (A-06) — this file is the
 * chokepoint that catches the copy drifting from the original. It reaches the
 * real private methods via type erasure on a bare prototype instance (no
 * constructor deps needed: none of these three methods touch `this`).
 */

const real = Object.create(
  DocumentNumberingService.prototype,
) as unknown as {
  computeResetKey(policy: ResetPolicy, now: Date): string;
  formatDate(format: string, date: Date): string;
  formatDocumentNumber(
    rule: DocumentNumberRuleShape,
    now: Date,
    sequence: number,
  ): string;
};

// Fixed instants — never Date.now(). One per month-end/year-boundary case the
// reset policies actually care about.
const MOMENTS = [
  new Date('2026-01-01T00:00:00.000Z'), // start of month/year
  new Date('2026-08-31T23:59:59.000Z'), // month-end, no year change
  new Date('2026-12-31T23:59:59.000Z'), // year-end
  new Date('2027-01-01T00:00:01.000Z'), // just after year change
];

describe('document-number-format — parity with DocumentNumberingService (AC-14)', () => {
  describe('computeResetKey — all 4 ResetPolicy values × 4 period-boundary moments', () => {
    for (const policy of [
      ResetPolicy.DAILY,
      ResetPolicy.MONTHLY,
      ResetPolicy.YEARLY,
      ResetPolicy.NEVER,
    ]) {
      for (const moment of MOMENTS) {
        it(`${policy} @ ${moment.toISOString()}`, () => {
          expect(computeResetKey(policy, moment)).toBe(
            real.computeResetKey(policy, moment),
          );
        });
      }
    }
  });

  describe('formatDate — every format token × all 4 moments', () => {
    for (const format of ['YYYYMMDD', 'YYYYMM', 'YYYY', 'MMDD', 'MM', 'DD', 'UNRECOGNIZED']) {
      for (const moment of MOMENTS) {
        it(`${format} @ ${moment.toISOString()}`, () => {
          expect(formatDate(format, moment)).toBe(real.formatDate(format, moment));
        });
      }
    }
  });

  describe('formatDocumentNumber — 3 rule shapes × 3 sequences (12+ cases, AC-14)', () => {
    const rules: Array<[string, DocumentNumberRuleShape]> = [
      [
        'continuous (no date, no suffix, 6-digit sequence)',
        { prefix: 'NV', includeDate: false, dateFormat: 'YYYYMM', sequenceLength: 6 },
      ],
      [
        'dated (YYYYMM, 5-digit sequence)',
        { prefix: 'INV', includeDate: true, dateFormat: 'YYYYMM', sequenceLength: 5 },
      ],
      [
        'dated with suffix (YYYYMMDD, 4-digit sequence)',
        {
          prefix: 'HD',
          suffix: 'BAN',
          includeDate: true,
          dateFormat: 'YYYYMMDD',
          sequenceLength: 4,
        },
      ],
    ];

    for (const [label, rule] of rules) {
      for (const sequence of [1, 42, 99999]) {
        it(`${label}, seq=${sequence}`, () => {
          const moment = MOMENTS[1];
          expect(formatDocumentNumber(rule, moment, sequence)).toBe(
            real.formatDocumentNumber(rule, moment, sequence),
          );
        });
      }
    }

    it('continuous rule renders "<prefix><seq>" with no separator, no date, no suffix', () => {
      const rule: DocumentNumberRuleShape = {
        prefix: 'NV',
        includeDate: false,
        dateFormat: 'YYYYMM',
        sequenceLength: 6,
      };
      expect(formatDocumentNumber(rule, MOMENTS[0], 1)).toBe('NV000001');
    });

    it('a 5-digit sequenceLength and a 6-digit sequenceLength pad differently for the same sequence', () => {
      const short: DocumentNumberRuleShape = {
        prefix: 'A',
        includeDate: false,
        dateFormat: 'YYYYMM',
        sequenceLength: 5,
      };
      const long: DocumentNumberRuleShape = { ...short, sequenceLength: 6 };
      expect(formatDocumentNumber(short, MOMENTS[0], 7)).toBe('A00007');
      expect(formatDocumentNumber(long, MOMENTS[0], 7)).toBe('A000007');
    });
  });
});
