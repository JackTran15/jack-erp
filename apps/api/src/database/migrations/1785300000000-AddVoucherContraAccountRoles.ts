import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add contra-account roles for manually-created cash receipt/payment vouchers.
 *
 * When a manual voucher is created it now posts to the ledger immediately, with
 * its contra account resolved server-side from the voucher purpose via
 * `accounting_default_account`. That needs three more roles beyond the original
 * REVENUE/RECEIVABLE:
 *   - OTHER_INCOME  receipts (other income, TK 711)
 *   - PAYABLE       payments to suppliers (TK 331)
 *   - EXPENSE       expense/salary payments (TK 642)
 *
 * `ALTER TYPE ... ADD VALUE` is allowed inside a transaction on Postgres 12+ as
 * long as the new value is not used in the same transaction (it is not here).
 * `IF NOT EXISTS` makes re-runs idempotent. Postgres cannot drop enum values, so
 * down() is intentionally a no-op.
 */
export class AddVoucherContraAccountRoles1785300000000
  implements MigrationInterface
{
  name = 'AddVoucherContraAccountRoles1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "accounting_default_account_role_enum" ADD VALUE IF NOT EXISTS 'OTHER_INCOME'`,
    );
    await queryRunner.query(
      `ALTER TYPE "accounting_default_account_role_enum" ADD VALUE IF NOT EXISTS 'PAYABLE'`,
    );
    await queryRunner.query(
      `ALTER TYPE "accounting_default_account_role_enum" ADD VALUE IF NOT EXISTS 'EXPENSE'`,
    );
  }

  public async down(): Promise<void> {
    // No-op: Postgres cannot remove a value from an enum type.
  }
}
