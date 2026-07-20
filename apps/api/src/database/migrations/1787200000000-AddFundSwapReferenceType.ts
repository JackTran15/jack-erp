import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Pairs the legs of a fund swap (FR-08) so each generated voucher can point at
 * its counterpart: every leg gets reference_type = FUND_SWAP and a shared
 * reference_id (the swap id).
 *
 * Must stay in its own migration — Postgres cannot use an enum value that was
 * added in the same transaction, and `migrationsTransactionMode: 'each'`
 * (data-source.ts) commits this file before any later migration or runtime code
 * writes the new value.
 */
export class AddFundSwapReferenceType1787200000000 implements MigrationInterface {
  name = "AddFundSwapReferenceType1787200000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "bank_payment_reference_type_enum" ADD VALUE IF NOT EXISTS 'FUND_SWAP'`,
    );
    await q.query(
      `ALTER TYPE "bank_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'FUND_SWAP'`,
    );
    await q.query(
      `ALTER TYPE "cash_receipt_reference_type_enum" ADD VALUE IF NOT EXISTS 'FUND_SWAP'`,
    );
    await q.query(
      `ALTER TYPE "cash_payment_reference_type_enum" ADD VALUE IF NOT EXISTS 'FUND_SWAP'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a single enum value safely; keep FUND_SWAP inert.
  }
}
