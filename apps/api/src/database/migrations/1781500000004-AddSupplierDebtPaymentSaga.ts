import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saga-state table for the "trả nợ NCC" (supplier-debt payment) flow — the AP
 * mirror of cash_debt_collection_saga. One row per payment request; the whole
 * settlement runs in one ACID transaction and this row records the outcome
 * (COMPLETED / COMPENSATED) for observability and compensation. Idempotent per
 * (organization_id, idempotency_key). Reuses debt_collection_saga_status_enum.
 */
export class AddSupplierDebtPaymentSaga1781500000004
  implements MigrationInterface
{
  name = 'AddSupplierDebtPaymentSaga1781500000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cash_supplier_debt_payment_saga" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "idempotency_key" character varying(200) NOT NULL,
        "status" "debt_collection_saga_status_enum" NOT NULL DEFAULT 'PENDING',
        "cash_payment_id" uuid,
        "cash_account_id" uuid NOT NULL,
        "contra_account_id" uuid NOT NULL,
        "partner_type" character varying(32),
        "partner_id" uuid,
        "total_amount" numeric(18,2) NOT NULL,
        "allocations" jsonb NOT NULL,
        "error" text,
        CONSTRAINT "PK_cash_supplier_debt_payment_saga" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_supplier_debt_payment_saga_org_status" ON "cash_supplier_debt_payment_saga" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_supplier_debt_payment_saga_payment" ON "cash_supplier_debt_payment_saga" ("cash_payment_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_supplier_debt_payment_saga_idem" ON "cash_supplier_debt_payment_saga" ("organization_id", "idempotency_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_supplier_debt_payment_saga_idem"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_supplier_debt_payment_saga_payment"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_supplier_debt_payment_saga_org_status"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "cash_supplier_debt_payment_saga"`,
    );
  }
}
