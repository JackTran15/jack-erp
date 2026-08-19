import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fills in `invoices.points_earned` where it was never populated, from the
 * `point_history` ledger that recorded the earn at the time.
 *
 * `points_earned` was added by `c9488fab` (2026-07-16). Invoices written around
 * that deploy kept the column's `0` default even though the async award consumer
 * really did credit the card and write an `earn` row. On the production clone
 * that is 24 of 90 posted customer sales — 3.224 points, the newest issued
 * 2026-07-19 — including `INV-202607-00001`, which reads 0 against a ledger earn
 * of 1.050.
 *
 * This runs because `promotion-points-reverse-defects` caps a return's point
 * reversal at the original invoice's `points_earned` (ADR-02). That cap reads a
 * `0` as "this sale earned nothing"; on these rows it means "nobody wrote the
 * column", and capping on them would refuse to claw back points that genuinely
 * were awarded. A migration rather than an ops script precisely so the cap can
 * never reach an environment this repair has not (ADR-05).
 *
 * Rows are found by predicate, not by a fixed id list: production may hold more
 * of them than the clone does.
 *
 * Deliberately narrow. It writes only where the column is empty AND the ledger is
 * positive, so it never overwrites a value someone recorded on purpose. The
 * mirror-image rows — column right, ledger empty, on three invoices whose cards
 * were never actually credited — are left alone: they need a card credit, not a
 * column write, and that is a different correction (see this feature's
 * `08-impact-assessment.md`, Finding C).
 */
export class BackfillInvoicePointsEarnedFromLedger1789000000000
  implements MigrationInterface
{
  name = 'BackfillInvoicePointsEarnedFromLedger1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Report before touching anything, so the deploy log carries the real
    // production number rather than the one measured on a clone.
    const [preview] = await queryRunner.query(`
      SELECT count(*)::int AS rows, coalesce(sum(l.ledger_earn), 0)::int AS points
      FROM "invoices" i
      JOIN (
        SELECT "invoice_id", sum("delta")::int AS ledger_earn
        FROM "point_history"
        WHERE "type" = 'earn' AND "invoice_id" IS NOT NULL
        GROUP BY "invoice_id"
      ) l ON l."invoice_id" = i."id"
      WHERE i."points_earned" = 0 AND l.ledger_earn > 0
    `);
    console.log(
      `[BackfillInvoicePointsEarnedFromLedger] will update ${preview.rows} invoice(s), ` +
        `${preview.points} point(s)`,
    );

    // Remember exactly which rows were changed so `down()` can be precise instead
    // of re-deriving a predicate that no longer matches once the values are set.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "_backfill_points_earned_1789000000000" (
        "invoice_id" uuid PRIMARY KEY
      )
    `);
    await queryRunner.query(`
      INSERT INTO "_backfill_points_earned_1789000000000" ("invoice_id")
      SELECT i."id"
      FROM "invoices" i
      JOIN (
        SELECT "invoice_id", sum("delta")::int AS ledger_earn
        FROM "point_history"
        WHERE "type" = 'earn' AND "invoice_id" IS NOT NULL
        GROUP BY "invoice_id"
      ) l ON l."invoice_id" = i."id"
      WHERE i."points_earned" = 0 AND l.ledger_earn > 0
      ON CONFLICT DO NOTHING
    `);

    // 'earn' is stored lowercase — the enum is point_type_enum('earn','redeem','adjust').
    const result = await queryRunner.query(`
      UPDATE "invoices" i
      SET "points_earned" = l.ledger_earn
      FROM (
        SELECT "invoice_id", sum("delta")::int AS ledger_earn
        FROM "point_history"
        WHERE "type" = 'earn' AND "invoice_id" IS NOT NULL
        GROUP BY "invoice_id"
      ) l
      WHERE l."invoice_id" = i."id"
        AND i."points_earned" = 0
        AND l.ledger_earn > 0
      RETURNING i."id"
    `);
    console.log(
      `[BackfillInvoicePointsEarnedFromLedger] updated ${result.length} invoice(s)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Every row this migration touched held 0 beforehand, so restoring is exact
    // — but only for the rows it actually touched, which is why they were
    // recorded rather than re-derived.
    await queryRunner.query(`
      UPDATE "invoices"
      SET "points_earned" = 0
      WHERE "id" IN (SELECT "invoice_id" FROM "_backfill_points_earned_1789000000000")
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "_backfill_points_earned_1789000000000"`,
    );
  }
}
