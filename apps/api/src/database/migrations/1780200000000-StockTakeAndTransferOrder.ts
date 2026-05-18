import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockTakeAndTransferOrder1780200000000 implements MigrationInterface {
  name = 'StockTakeAndTransferOrder1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Stock Take ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "stock_take_status_enum" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED')
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_takes" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "document_number"  varchar NULL,
        "status"           "stock_take_status_enum" NOT NULL DEFAULT 'DRAFT',
        "storage_id"       uuid NULL,
        "location_id"      uuid NULL,
        "snapshot_at"      timestamptz NOT NULL,
        "notes"            text NULL,
        "posted_at"        timestamptz NULL,
        "posted_by"        uuid NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_stock_takes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_stock_takes_org_document_number" UNIQUE ("organization_id", "document_number")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_stock_takes_org_status" ON "stock_takes" ("organization_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "stock_take_lines" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "stock_take_id"    uuid NOT NULL,
        "item_id"          uuid NOT NULL,
        "location_id"      uuid NOT NULL,
        "expected_qty"     numeric(18,3) NOT NULL DEFAULT 0,
        "counted_qty"      numeric(18,3) NULL,
        "note"             text NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_stock_take_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_take_lines_take"
          FOREIGN KEY ("stock_take_id") REFERENCES "stock_takes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_take_lines_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_take_lines_location"
          FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_stock_take_lines_take" ON "stock_take_lines" ("stock_take_id")`,
    );

    // ─── Transfer Order ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "transfer_order_status_enum" AS ENUM ('DRAFT', 'APPROVED', 'EXECUTED', 'CANCELLED')
    `);

    await queryRunner.query(`
      CREATE TABLE "transfer_orders" (
        "id"                   uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"      varchar NOT NULL,
        "branch_id"            varchar NULL,
        "document_number"      varchar NULL,
        "status"               "transfer_order_status_enum" NOT NULL DEFAULT 'DRAFT',
        "source_branch_id"     varchar NOT NULL,
        "destination_branch_id" varchar NOT NULL,
        "source_storage_id"    uuid NULL,
        "destination_storage_id" uuid NULL,
        "requested_date"       date NULL,
        "notes"                text NULL,
        "approved_at"          timestamptz NULL,
        "approved_by"          uuid NULL,
        "executed_at"          timestamptz NULL,
        "executed_by"          uuid NULL,
        "executed_transfer_id" uuid NULL,
        "created_at"           TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"           TIMESTAMP NULL,
        "created_by"           varchar NOT NULL,
        CONSTRAINT "PK_transfer_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transfer_orders_org_document_number" UNIQUE ("organization_id", "document_number")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_transfer_orders_org_status" ON "transfer_orders" ("organization_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "transfer_order_lines" (
        "id"                 uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"    varchar NOT NULL,
        "branch_id"          varchar NULL,
        "transfer_order_id"  uuid NOT NULL,
        "item_id"            uuid NOT NULL,
        "requested_qty"      numeric(18,3) NOT NULL,
        "note"               text NULL,
        "created_at"         TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"         varchar NOT NULL,
        CONSTRAINT "PK_transfer_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transfer_order_lines_order"
          FOREIGN KEY ("transfer_order_id") REFERENCES "transfer_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transfer_order_lines_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_transfer_order_lines_order" ON "transfer_order_lines" ("transfer_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transfer_order_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transfer_orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transfer_order_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_take_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_takes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stock_take_status_enum"`);
  }
}
