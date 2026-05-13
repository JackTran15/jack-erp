import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerCreditLedger1779800002000 implements MigrationInterface {
  name = 'AddCustomerCreditLedger1779800002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "customer_credit_status_enum" AS ENUM ('OPEN', 'CONSUMED', 'EXPIRED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "customer_credits" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  character varying NOT NULL,
        "branch_id"        character varying NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"       character varying NOT NULL,
        "deleted_at"       TIMESTAMPTZ NULL,
        "customer_id"      uuid NOT NULL,
        "source_invoice_id" uuid NOT NULL,
        "reference_code"   varchar(50) NOT NULL,
        "original_amount"  numeric(18,2) NOT NULL,
        "used_amount"      numeric(18,2) NOT NULL DEFAULT 0,
        "remaining_amount" numeric(18,2) NOT NULL,
        "status"           "customer_credit_status_enum" NOT NULL DEFAULT 'OPEN',
        "issued_at"        date NOT NULL,
        "expires_at"       date NULL,
        CONSTRAINT "PK_customer_credits" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_credits_customer"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_customer_credits_invoice"
          FOREIGN KEY ("source_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_customer_credit_ref"
         ON "customer_credits" ("organization_id", "reference_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_customer_credit_customer_status"
         ON "customer_credits" ("customer_id", "status") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_customer_credit_customer_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_customer_credit_ref"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_credits"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "customer_credit_status_enum"`);
  }
}
