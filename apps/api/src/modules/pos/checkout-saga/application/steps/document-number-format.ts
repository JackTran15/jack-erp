import { ResetPolicy } from '../../../../document-numbering/document-number-rule.entity';

/**
 * Byte-for-byte port of the private formatting logic in
 * `DocumentNumberingService` (`computeResetKey`, `formatDocumentNumber`,
 * `formatDate`) — those methods are private, so this saga cannot call the
 * service directly (A-06). Exported here so T-02-06 can prove, on a 12-case
 * matrix against the real private methods (via type-erasure), that this copy
 * never drifts from the original.
 *
 * Do NOT "simplify" `next-document-number.step.ts` into a call to
 * `DocumentNumberingService` because this looks redundant — see ADR-02 in
 * 03-logical-design.md for exactly why that breaks rollback safety.
 */

/** The subset of DocumentNumberRuleEntity these functions actually read. */
export interface DocumentNumberRuleShape {
  prefix: string;
  suffix?: string;
  includeDate: boolean;
  dateFormat: string;
  sequenceLength: number;
  separator: string;
}

export function computeResetKey(policy: ResetPolicy, now: Date): string {
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  switch (policy) {
    case ResetPolicy.DAILY:
      return `${year}-${month}-${day}`;
    case ResetPolicy.MONTHLY:
      return `${year}-${month}`;
    case ResetPolicy.YEARLY:
      return year;
    case ResetPolicy.NEVER:
      return 'NEVER';
  }
}

export function formatDate(format: string, date: Date): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  const replacements: Record<string, string> = {
    YYMMDD: `${year.slice(-2)}${month}${day}`,
    YYYYMMDD: `${year}${month}${day}`,
    YYYYMM: `${year}${month}`,
    YYYY: year,
    MMDD: `${month}${day}`,
    MM: month,
    DD: day,
  };

  return replacements[format] ?? `${year}${month}${day}`;
}

export function formatDocumentNumber(
  rule: DocumentNumberRuleShape,
  now: Date,
  sequence: number,
): string {
  const seq = sequence.toString().padStart(rule.sequenceLength, '0');
  // Continuous rules (no date, no suffix) render as "<prefix><seq>" with no
  // separator; rules with a date or suffix join on the rule's own separator.
  if (!rule.includeDate && !rule.suffix) {
    return `${rule.prefix}${seq}`;
  }

  const parts: string[] = [rule.prefix];
  if (rule.includeDate) {
    parts.push(formatDate(rule.dateFormat, now));
  }
  parts.push(seq);
  if (rule.suffix) {
    parts.push(rule.suffix);
  }
  return parts.join(rule.separator);
}
