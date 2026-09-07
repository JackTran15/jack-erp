import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives the four treasury voucher tables a `revision` counter, so a posted
 * voucher can be edited in place instead of only reversed.
 *
 * `revision` does two jobs at once, and both matter:
 *
 * 1. It is the optimistic-concurrency token. `update()` and `delete()` re-read
 *    the voucher `FOR UPDATE` inside their transaction and compare the caller's
 *    `revision` against the stored one; a mismatch is refused rather than
 *    silently overwriting. The warehouse side learned this the hard way twice —
 *    once when a double-cancel wrote two sets of reversing entries, once in
 *    production when a dialog seeded its state at mount and PATCHed stale values
 *    onto a different voucher's id.
 * 2. It labels the adjustment. Editing a posted voucher appends a compensating
 *    cash/deposit movement whose note reads `Adjustment for <docNumber> rev <n>`,
 *    so a chain of edits can be read back off the ledger in order.
 *
 * `DEFAULT 0` is deliberate here, unlike `line_no` on the goods tables where a
 * default would have hidden a missed insert path. There is no uniqueness to
 * collide with, every existing row genuinely is at revision 0, and the column
 * has to be NOT NULL from the first moment so the concurrency check never has to
 * reason about NULL. Backfill and constraint therefore collapse into the single
 * `ADD COLUMN ... NOT NULL DEFAULT 0`, which Postgres 11+ does without rewriting
 * the table.
 *
 * Plain `ADD COLUMN`, so this migration does NOT need `transaction: 'each'` —
 * that is required for `ALTER TYPE ... ADD VALUE`, which this feature avoids on
 * purpose (ADR-02: a deleted voucher is soft-deleted, not moved to a new
 * `CANCELLED` enum value).
 */
export class AddTreasuryVoucherRevision1789700000000
  implements MigrationInterface
{
  name = 'AddTreasuryVoucherRevision1789700000000';

  private static readonly TABLES = [
    'cash_receipts',
    'cash_payments',
    'bank_receipts',
    'bank_payments',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of AddTreasuryVoucherRevision1789700000000.TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of AddTreasuryVoucherRevision1789700000000.TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "revision"`,
      );
    }
  }
}
