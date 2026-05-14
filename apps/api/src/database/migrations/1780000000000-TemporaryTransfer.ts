import { MigrationInterface, QueryRunner } from 'typeorm';

export class TemporaryTransfer1780000000000 implements MigrationInterface {
  name = 'TemporaryTransfer1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. Extend locations_type_enum with TEMPORARY value ───────────
    await queryRunner.query(
      `ALTER TYPE "public"."locations_type_enum" ADD VALUE IF NOT EXISTS 'TEMPORARY'`,
    );

    // Extend document numbering rule enum so DocumentType.TEMPORARY_TRANSFER
    // (shared-interfaces) can persist. InitSchema only seeded the original 8
    // values; PURCHASE_ORDER/GOODS_ISSUE were added in 1777200000000.
    await queryRunner.query(
      `ALTER TYPE "public"."document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'TEMPORARY_TRANSFER'`,
    );

    // ─── 2. Create enum for temporary transfer status ─────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."temporary_transfers_status_enum" AS ENUM(
        'OPEN', 'PARTIALLY_RETURNED', 'FULLY_RETURNED', 'CANCELLED'
      )
    `);

    // ─── 3. Create temporary_transfers (header) ───────────────────────
    await queryRunner.query(`
      CREATE TABLE "temporary_transfers" (
        "id"                            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"               varchar NOT NULL,
        "branch_id"                     varchar NULL,
        "document_number"               varchar NULL,
        "source_branch_id"              uuid NOT NULL,
        "destination_temp_location_id"  uuid NOT NULL,
        "carrier_user_id"               uuid NOT NULL,
        "status"                        "public"."temporary_transfers_status_enum" NOT NULL DEFAULT 'OPEN',
        "notes"                         text NULL,
        "posted_at"                     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "posted_by"                     uuid NOT NULL,
        "returned_at"                   TIMESTAMP WITH TIME ZONE NULL,
        "created_at"                    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"                    TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"                    varchar NOT NULL,
        CONSTRAINT "PK_temporary_transfers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_temporary_transfers_doc_number" UNIQUE ("document_number"),
        CONSTRAINT "FK_temp_xfer_dest_location"
          FOREIGN KEY ("destination_temp_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_temp_xfer_org_status" ON "temporary_transfers" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_temp_xfer_org_branch_posted" ON "temporary_transfers" ("organization_id", "branch_id", "posted_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_temp_xfer_carrier" ON "temporary_transfers" ("carrier_user_id")`,
    );

    // ─── 4. Create temporary_transfer_lines ───────────────────────────
    await queryRunner.query(`
      CREATE TABLE "temporary_transfer_lines" (
        "id"                  uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transfer_id"         uuid NOT NULL,
        "item_id"             uuid NOT NULL,
        "source_location_id"  uuid NOT NULL,
        "quantity"            numeric(18,2) NOT NULL,
        "returned_quantity"   numeric(18,2) NOT NULL DEFAULT 0,
        "notes"               text NULL,
        CONSTRAINT "PK_temporary_transfer_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_temp_xfer_lines_transfer"
          FOREIGN KEY ("transfer_id") REFERENCES "temporary_transfers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_temp_xfer_lines_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_temp_xfer_lines_source_location"
          FOREIGN KEY ("source_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_temp_xfer_lines_qty_positive" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_temp_xfer_lines_returned_bounded"
          CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_temp_xfer_lines_transfer" ON "temporary_transfer_lines" ("transfer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_temp_xfer_lines_item" ON "temporary_transfer_lines" ("item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_temp_xfer_lines_outstanding"
         ON "temporary_transfer_lines" ("transfer_id")
         WHERE "returned_quantity" < "quantity"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "temporary_transfer_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "temporary_transfers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."temporary_transfers_status_enum"`);
    // NOTE: cannot remove enum value 'TEMPORARY' from locations_type_enum in PostgreSQL;
    // leaving it in place is safe (no rows reference it unless seeded).
  }
}
