import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add 'BANK_MOVEMENT' to the journal-entry source enum.
 *
 * `JournalSource.BANK_MOVEMENT` was added to the TS enum with the deposit-fund
 * work and is written by `DepositService.createAndPostInternal`, but no
 * migration ever added it to the Postgres enum — so every deposit movement that
 * posted its journal entry failed with `invalid input value for enum
 * journal_entries_source_enum: "BANK_MOVEMENT"` and landed in the dead-letter
 * table (topic `erp.deposit.movement.from.payment`). Its cash counterpart
 * 'CASH_MOVEMENT' has been in the enum since InitSchema, which is why cash
 * checkouts were unaffected.
 *
 * `down` is a no-op: Postgres cannot drop a value from an enum type, and the
 * value is additive so leaving it costs nothing.
 */
export class AddBankMovementToJournalSourceEnum1787100000000
  implements MigrationInterface
{
  name = 'AddBankMovementToJournalSourceEnum1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "journal_entries_source_enum" ADD VALUE IF NOT EXISTS 'BANK_MOVEMENT' AFTER 'CASH_MOVEMENT'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentional no-op — see header comment.
  }
}
