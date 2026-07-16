import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bug fix (found via TKT-DFR-09 E2E, not caught by unit tests since those mock
 * the DB layer): `deposit_movements.source_ref_line_id` was declared `uuid` in
 * GĐ1 (1786500000000-DepositFundFoundation) for its original purpose — holding
 * `invoice_payments.id` for the payment-line-grain idempotency guard. GĐ3
 * (TKT-DFR-03 fee posting, TKT-DFR-05 reversal) also uses this column for
 * non-UUID string markers (`'FEE'`, `'<originalLineId>-REVERSAL'`), which a
 * `uuid`-typed column rejects at insert time. Widening to `varchar` is
 * backward-compatible — every existing value is already a valid UUID string.
 */
export class WidenDepositMovementSourceRefLineId1786800000000
  implements MigrationInterface
{
  name = 'WidenDepositMovementSourceRefLineId1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deposit_movements"
        ALTER COLUMN "source_ref_line_id" TYPE varchar USING "source_ref_line_id"::varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deposit_movements"
        ALTER COLUMN "source_ref_line_id" TYPE uuid USING "source_ref_line_id"::uuid
    `);
  }
}
