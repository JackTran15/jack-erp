import { BadRequestException } from '@nestjs/common';

/**
 * The single home of the report row cap.
 *
 * It used to live in `inventory-reports/report/report-data.util.ts`, with a
 * second copy in `report-export.service.ts` because report-core could not
 * import the domain util. Two numbers that must stay equal is one number too
 * many, so the constant moved down here and the domain util re-exports it.
 */
export const MAX_REPORT_ROWS = 50_000;

/**
 * Refuse a report that would pull more than the cap into memory.
 *
 * `subject` names what was counted, because the count is not always the
 * report's own row count: a report that aggregates in memory counts the source
 * records it has to load, and telling the user "50000 rows" when the report
 * has 800 of them is a message that sends them looking in the wrong place.
 */
export function assertUnderRowCap(total: number, subject = 'rows'): void {
  if (total > MAX_REPORT_ROWS) {
    throw new BadRequestException(
      `Report exceeds ${MAX_REPORT_ROWS} ${subject} (${total}); narrow the period or filters`,
    );
  }
}
