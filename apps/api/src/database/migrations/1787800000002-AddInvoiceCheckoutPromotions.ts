import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshot of the promotion programmes that actually ran for one invoice, taken
 * inside the checkout transaction.
 *
 * This is an audit record, not a live join: it stores the code, name, type,
 * priority and computed amounts as they were at checkout time, so a later edit
 * to (or soft-delete of) the programme cannot rewrite history on a posted
 * invoice.
 *
 * Deliberately separate from the legacy `invoice_promotions` table, which
 * belongs to the v1 flow and is not touched by this epic.
 */
export class AddInvoiceCheckoutPromotions1787800000002
  implements MigrationInterface
{
  name = 'AddInvoiceCheckoutPromotions1787800000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoice_checkout_promotions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "invoice_id" uuid NOT NULL,
        "program_id" uuid NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(255) NOT NULL,
        "type" character varying(32) NOT NULL,
        "priority" integer NOT NULL,
        "discount_amount" numeric(18,2) NOT NULL DEFAULT 0,
        "line_discounts" jsonb,
        "gifts" jsonb,
        CONSTRAINT "PK_invoice_checkout_promotions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_checkout_promotions_invoice" ON "invoice_checkout_promotions" ("invoice_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invoice_checkout_promotions_invoice_program" ON "invoice_checkout_promotions" ("invoice_id", "program_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_checkout_promotions_org_program" ON "invoice_checkout_promotions" ("organization_id", "program_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_invoice_checkout_promotions_org_program"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_invoice_checkout_promotions_invoice_program"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_invoice_checkout_promotions_invoice"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "invoice_checkout_promotions"`,
    );
  }
}
