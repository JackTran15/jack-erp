import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add per-invoice credit term tracking and an org-wide default.
 *
 * - invoice_debts.credit_days: credit term in days entered at checkout (per
 *   invoice). The due_date column already exists (1778000000000); this stores
 *   the term the cashier chose so it can be shown exactly as sold.
 * - organizations.default_credit_days: org-wide value used to prefill the POS
 *   "Hạn thanh toán" modal. Cashiers can still override it per invoice.
 *
 * Both columns are nullable so existing rows stay valid without a backfill.
 */
export class AddDebtCreditDaysAndOrgDefault1784400000000
  implements MigrationInterface
{
  name = 'AddDebtCreditDaysAndOrgDefault1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice_debts" ADD COLUMN "credit_days" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN "default_credit_days" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "default_credit_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_debts" DROP COLUMN "credit_days"`,
    );
  }
}
