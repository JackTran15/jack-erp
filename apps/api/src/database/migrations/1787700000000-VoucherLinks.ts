import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `voucher_links` — a polymorphic link between two vouchers (ADR-02).
 *
 * The existing `reverses_voucher_id` / `reversed_by_voucher_id` columns only
 * point within one table, but a cancelled invoice pairs a cash *receipt* with a
 * cash *payment*. Rather than adding a column pair to every voucher table, one
 * link table carries the relation and names both sides by kind.
 *
 * No hard FK to the voucher tables on purpose: `from_kind` decides which table
 * `from_id` refers to.
 */
export class VoucherLinks1787700000000 implements MigrationInterface {
  name = 'VoucherLinks1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "voucher_link_kind_enum" AS ENUM ('CASH_RECEIPT', 'CASH_PAYMENT', 'BANK_RECEIPT', 'BANK_PAYMENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "voucher_link_relation_enum" AS ENUM ('REFUNDED_BY')`,
    );

    await queryRunner.query(`
      CREATE TABLE "voucher_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "branch_id" uuid,
        "from_kind" "voucher_link_kind_enum" NOT NULL,
        "from_id" uuid NOT NULL,
        "to_kind" "voucher_link_kind_enum" NOT NULL,
        "to_id" uuid NOT NULL,
        "relation" "voucher_link_relation_enum" NOT NULL,
        "invoice_id" uuid,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_voucher_links" PRIMARY KEY ("id")
      )
    `);

    // The replay guard: re-handling a cancellation event must not duplicate the pair.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_voucher_links_pair" ON "voucher_links" ("organization_id", "from_kind", "from_id", "to_kind", "to_id", "relation")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_voucher_links_from" ON "voucher_links" ("organization_id", "from_kind", "from_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_voucher_links_to" ON "voucher_links" ("organization_id", "to_kind", "to_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_voucher_links_invoice" ON "voucher_links" ("organization_id", "invoice_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_voucher_links_invoice"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_voucher_links_to"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_voucher_links_from"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_voucher_links_pair"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "voucher_links"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "voucher_link_relation_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "voucher_link_kind_enum"`);
  }
}
