import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoodsReceiptModule1779800000000 implements MigrationInterface {
  name = 'AddGoodsReceiptModule1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "goods_receipt_status_enum" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED', 'REVERSED')
    `);

    await queryRunner.query(`
      CREATE TYPE "goods_receipt_purpose_enum" AS ENUM ('OTHER', 'TRANSFER_IN')
    `);

    await queryRunner.query(`
      CREATE TYPE "goods_receipt_reference_type_enum" AS ENUM ('PURCHASE_ORDER', 'STOCK_TRANSFER')
    `);

    await queryRunner.query(`
      CREATE TABLE "goods_receipts" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "document_number"  varchar NULL,
        "status"           "goods_receipt_status_enum" NOT NULL DEFAULT 'DRAFT',
        "purpose"          "goods_receipt_purpose_enum" NOT NULL DEFAULT 'OTHER',
        "provider_id"      uuid NULL,
        "delivered_by"     varchar(200) NULL,
        "reason"           varchar(500) NULL,
        "description"      varchar(2000) NULL,
        "reference_id"     uuid NULL,
        "reference_type"   "goods_receipt_reference_type_enum" NULL,
        "source_branch_id" varchar NULL,
        "received_at"      timestamptz NOT NULL,
        "location_id"      uuid NOT NULL,
        "attachment_ids"   jsonb NOT NULL DEFAULT '[]'::jsonb,
        "cash_payment_id"  uuid NULL,
        "cash_receipt_id"  uuid NULL,
        "posted_at"        timestamptz NULL,
        "posted_by"        uuid NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_goods_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_goods_receipts_org_document_number" UNIQUE ("organization_id", "document_number"),
        CONSTRAINT "FK_goods_receipts_provider"
          FOREIGN KEY ("provider_id") REFERENCES "inventory_providers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_goods_receipts_location"
          FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_goods_receipts_org_status" ON "goods_receipts" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_goods_receipts_received_at" ON "goods_receipts" ("received_at" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "goods_receipt_lines" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"   varchar NOT NULL,
        "branch_id"         varchar NULL,
        "goods_receipt_id"  uuid NOT NULL,
        "item_id"           uuid NOT NULL,
        "location_id"       uuid NOT NULL,
        "bin_id"            uuid NULL,
        "uom_code"          varchar(50) NOT NULL,
        "quantity"          numeric(18,3) NOT NULL,
        "unit_price"        numeric(18,2) NOT NULL DEFAULT 0,
        "line_total"        numeric(18,2) NOT NULL DEFAULT 0,
        "note"              varchar(500) NULL,
        "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"        varchar NOT NULL,
        CONSTRAINT "PK_goods_receipt_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_goods_receipt_lines_receipt"
          FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_goods_receipt_lines_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_goods_receipt_lines_location"
          FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_goods_receipt_lines_receipt" ON "goods_receipt_lines" ("goods_receipt_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_goods_receipt_lines_item" ON "goods_receipt_lines" ("item_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "goods_receipt_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "goods_receipts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "goods_receipt_reference_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "goods_receipt_purpose_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "goods_receipt_status_enum"`);
  }
}
