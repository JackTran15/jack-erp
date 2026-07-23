import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * POS return/exchange can now refund the customer through a deposit/bank fund, not
 * just physical cash. Adds:
 *   - RefundMethod.BANK on invoices.refund_method
 *   - BankPaymentReferenceType.REFUND so the generated Phiếu chi ngân hàng links
 *     back to the return invoice.
 *
 * Must stay in its own migration — Postgres cannot use an enum value that was
 * added in the same transaction, and `migrationsTransactionMode: 'each'`
 * (data-source.ts) commits this file before any later migration or runtime code
 * writes the new value.
 */
export class AddBankRefundMethod1787600000000 implements MigrationInterface {
  name = "AddBankRefundMethod1787600000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "refund_method_enum" ADD VALUE IF NOT EXISTS 'BANK'`,
    );
    await q.query(
      `ALTER TYPE "bank_payment_reference_type_enum" ADD VALUE IF NOT EXISTS 'REFUND'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a single enum value safely; keep BANK / REFUND inert.
  }
}
