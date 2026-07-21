import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enum values needed by the inter-branch cash transfer (EPIC-21072026) and by
 * the "Chuyển tiền mặt thành tiền gửi" purpose on the cash payment voucher.
 *
 * Must stay in its own migration — Postgres cannot use an enum value that was
 * added in the same transaction, and `migrationsTransactionMode: 'each'`
 * (data-source.ts) commits this file before 1787300000001-CashTransfer (whose
 * table has no dependency on these values, but runtime code does) or any later
 * write of the new values.
 */
export class AddCashTransferEnumValues1787300000000 implements MigrationInterface {
  name = 'AddCashTransferEnumValues1787300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "cash_payment_purpose_enum" ADD VALUE IF NOT EXISTS 'DEPOSIT_TRANSFER'`,
    );
    await q.query(
      `ALTER TYPE "cash_payment_purpose_enum" ADD VALUE IF NOT EXISTS 'INTER_BRANCH_OUT'`,
    );
    await q.query(
      `ALTER TYPE "cash_receipt_purpose_enum" ADD VALUE IF NOT EXISTS 'INTER_BRANCH_IN'`,
    );
    await q.query(
      `ALTER TYPE "cash_payment_reference_type_enum" ADD VALUE IF NOT EXISTS 'TRANSFER'`,
    );
    await q.query(
      `ALTER TYPE "cash_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'TRANSFER'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a single enum value safely; keep the new values inert.
  }
}
