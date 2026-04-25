import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseOrdersAndGoodsIssues1777200000000 implements MigrationInterface {
  name = 'AddPurchaseOrdersAndGoodsIssues1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Purchase orders status enum
    await queryRunner.query(`
      CREATE TYPE "purchase_order_status_enum" AS ENUM (
        'DRAFT', 'APPROVED', 'RECEIVING', 'RECEIVED', 'CANCELLED'
      )
    `);

    // Goods issue status enum
    await queryRunner.query(`
      CREATE TYPE "goods_issue_status_enum" AS ENUM (
        'DRAFT', 'APPROVED', 'POSTED', 'CANCELLED'
      )
    `);

    // Extend stock ledger movement enum (name from InitSchema / TypeORM on stock_ledger_entries)
    await queryRunner.query(
      `ALTER TYPE "stock_ledger_entries_movement_type_enum" ADD VALUE IF NOT EXISTS 'GOODS_ISSUE'`,
    );

    // Extend document numbering rule enum (InitSchema: document_number_rules_document_type_enum)
    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'GOODS_ISSUE'`,
    );

    // ─── purchase_orders ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "purchase_orders" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id"       character varying,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"      character varying NOT NULL,
        "document_number" character varying UNIQUE,
        "provider_id"     uuid NOT NULL,
        "location_id"     uuid NOT NULL,
        "status"          "purchase_order_status_enum" NOT NULL DEFAULT 'DRAFT',
        "expected_date"   date,
        "notes"           character varying,
        "approved_by"     uuid,
        "approved_at"     TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_purchase_orders" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_purchase_orders_org_status" ON "purchase_orders" ("organization_id", "status")`,
    );

    // ─── purchase_order_lines ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "purchase_order_lines" (
        "id"                 uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_order_id"  uuid NOT NULL,
        "item_id"            uuid NOT NULL,
        "ordered_quantity"   numeric NOT NULL,
        "received_quantity"  numeric NOT NULL DEFAULT 0,
        "unit_price"         numeric NOT NULL DEFAULT 0,
        "notes"              character varying,
        CONSTRAINT "PK_purchase_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pol_purchase_order" FOREIGN KEY ("purchase_order_id")
          REFERENCES "purchase_orders"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_pol_purchase_order" ON "purchase_order_lines" ("purchase_order_id")`,
    );

    // ─── goods_issues ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "goods_issues" (
        "id"              uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id"       character varying,
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"      character varying NOT NULL,
        "document_number" character varying UNIQUE,
        "location_id"     uuid NOT NULL,
        "reason"          character varying NOT NULL,
        "status"          "goods_issue_status_enum" NOT NULL DEFAULT 'DRAFT',
        "notes"           character varying,
        "approved_by"     uuid,
        "approved_at"     TIMESTAMP WITH TIME ZONE,
        "posted_by"       uuid,
        "posted_at"       TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_goods_issues" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_goods_issues_org_status" ON "goods_issues" ("organization_id", "status")`,
    );

    // ─── goods_issue_lines ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "goods_issue_lines" (
        "id"             uuid NOT NULL DEFAULT uuid_generate_v4(),
        "goods_issue_id" uuid NOT NULL,
        "item_id"        uuid NOT NULL,
        "quantity"       numeric NOT NULL,
        "notes"          character varying,
        CONSTRAINT "PK_goods_issue_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_gil_goods_issue" FOREIGN KEY ("goods_issue_id")
          REFERENCES "goods_issues"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_gil_goods_issue" ON "goods_issue_lines" ("goods_issue_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gil_goods_issue"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "goods_issue_lines"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_goods_issues_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "goods_issues"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pol_purchase_order"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_order_lines"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "goods_issue_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "purchase_order_status_enum"`);
  }
}
