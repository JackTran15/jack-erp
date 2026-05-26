import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cash Vouchers — Phase 2 schema extension.
 *
 *  - Unique reference index on both voucher tables to prevent duplicate
 *    auto-created vouchers (filtered to allow re-issue after REVERSED).
 *  - goods_receipts / expenses: payment_method + cash account + JE link columns.
 *  - debt_payments: cash_receipt_id + journal_entry_id link columns.
 *
 * goods_receipts has no contra_account_id (contra for CASH is the inventory
 * account, derived in the source service), so nothing is dropped.
 */
export class CashVouchersPhase2Schema1781200000000 implements MigrationInterface {
  name = 'CashVouchersPhase2Schema1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Unique reference (anti-duplicate; allow re-issue after REVERSED) ---
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uniq_cash_receipts_reference"
        ON "cash_receipts" ("organization_id", "reference_type", "reference_id")
        WHERE "reference_type" IS NOT NULL AND "reference_id" IS NOT NULL
          AND "status" != 'REVERSED' AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uniq_cash_payments_reference"
        ON "cash_payments" ("organization_id", "reference_type", "reference_id")
        WHERE "reference_type" IS NOT NULL AND "reference_id" IS NOT NULL
          AND "status" != 'REVERSED' AND "deleted_at" IS NULL
    `);

    // ---- Enums --------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "goods_receipt_payment_method_enum" AS ENUM ('CASH', 'CREDIT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "expense_payment_method_enum" AS ENUM ('CASH', 'BANK', 'PAYABLE')`,
    );

    // ---- goods_receipts -----------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "goods_receipts"
         ADD COLUMN IF NOT EXISTS "payment_method" "goods_receipt_payment_method_enum" NULL,
         ADD COLUMN IF NOT EXISTS "cash_account_id" uuid NULL,
         ADD COLUMN IF NOT EXISTS "journal_entry_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts"
         ADD CONSTRAINT "FK_goods_receipts_cash_account"
         FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts"
         ADD CONSTRAINT "FK_goods_receipts_journal_entry"
         FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL`,
    );

    // ---- expenses -----------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "expenses"
         ADD COLUMN IF NOT EXISTS "payment_method" "expense_payment_method_enum" NULL,
         ADD COLUMN IF NOT EXISTS "cash_account_id" uuid NULL,
         ADD COLUMN IF NOT EXISTS "cash_payment_id" uuid NULL,
         ADD COLUMN IF NOT EXISTS "journal_entry_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses"
         ADD CONSTRAINT "FK_expenses_cash_account"
         FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses"
         ADD CONSTRAINT "FK_expenses_cash_payment"
         FOREIGN KEY ("cash_payment_id") REFERENCES "cash_payments"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses"
         ADD CONSTRAINT "FK_expenses_journal_entry"
         FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL`,
    );

    // ---- debt_payments ------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "debt_payments"
         ADD COLUMN IF NOT EXISTS "cash_receipt_id" uuid NULL,
         ADD COLUMN IF NOT EXISTS "journal_entry_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payments"
         ADD CONSTRAINT "FK_debt_payments_cash_receipt"
         FOREIGN KEY ("cash_receipt_id") REFERENCES "cash_receipts"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payments"
         ADD CONSTRAINT "FK_debt_payments_journal_entry"
         FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "debt_payments" DROP CONSTRAINT IF EXISTS "FK_debt_payments_journal_entry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payments" DROP CONSTRAINT IF EXISTS "FK_debt_payments_cash_receipt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "debt_payments" DROP COLUMN IF EXISTS "journal_entry_id", DROP COLUMN IF EXISTS "cash_receipt_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_journal_entry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_cash_payment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_cash_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses"
         DROP COLUMN IF EXISTS "journal_entry_id",
         DROP COLUMN IF EXISTS "cash_payment_id",
         DROP COLUMN IF EXISTS "cash_account_id",
         DROP COLUMN IF EXISTS "payment_method"`,
    );

    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP CONSTRAINT IF EXISTS "FK_goods_receipts_journal_entry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP CONSTRAINT IF EXISTS "FK_goods_receipts_cash_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts"
         DROP COLUMN IF EXISTS "journal_entry_id",
         DROP COLUMN IF EXISTS "cash_account_id",
         DROP COLUMN IF EXISTS "payment_method"`,
    );

    await queryRunner.query(`DROP TYPE IF EXISTS "expense_payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "goods_receipt_payment_method_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_cash_payments_reference"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_cash_receipts_reference"`);
  }
}
