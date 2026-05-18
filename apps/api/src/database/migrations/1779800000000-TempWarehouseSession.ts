import { MigrationInterface, QueryRunner } from 'typeorm';

export class TempWarehouseSession1779800000000 implements MigrationInterface {
  name = 'TempWarehouseSession1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. temp_warehouse_sessions ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "temp_warehouse_sessions" (
        "id"                          uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"             varchar NOT NULL,
        "branch_id"                   varchar NOT NULL,
        "status"                      varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "close_mode"                  varchar(20) NULL,
        "warehouse_location_id"       uuid NOT NULL,
        "showroom_location_id"        uuid NOT NULL,
        "opened_by"                   varchar NOT NULL,
        "opened_at"                   TIMESTAMP NOT NULL DEFAULT now(),
        "closed_by"                   varchar NULL,
        "closed_at"                   TIMESTAMP NULL,
        "transfer_processing_status"  varchar(20) NOT NULL DEFAULT 'NONE',
        "transfer_w2s_id"             uuid NULL,
        "transfer_s2w_id"             uuid NULL,
        "transfer_failure_reason"     text NULL,
        "notes"                       text NULL,
        "created_at"                  TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"                  TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"                  varchar NOT NULL,
        "deleted_at"                  TIMESTAMP NULL,
        CONSTRAINT "PK_temp_warehouse_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_temp_wh_sessions_warehouse_location"
          FOREIGN KEY ("warehouse_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_temp_wh_sessions_showroom_location"
          FOREIGN KEY ("showroom_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_temp_wh_sessions_transfer_w2s"
          FOREIGN KEY ("transfer_w2s_id") REFERENCES "stock_transfers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_temp_wh_sessions_transfer_s2w"
          FOREIGN KEY ("transfer_s2w_id") REFERENCES "stock_transfers"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_temp_wh_one_active_per_branch"
        ON "temp_warehouse_sessions" ("branch_id")
        WHERE "status" = 'ACTIVE' AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_temp_wh_sessions_org_status"
        ON "temp_warehouse_sessions" ("organization_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_temp_wh_sessions_processing"
        ON "temp_warehouse_sessions" ("transfer_processing_status")
        WHERE "transfer_processing_status" IN ('PENDING', 'FAILED')
    `);

    // ─── 2. temp_warehouse_lines ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "temp_warehouse_lines" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"   varchar NOT NULL,
        "branch_id"         varchar NULL,
        "session_id"        uuid NOT NULL,
        "item_id"           uuid NOT NULL,
        "direction"         varchar(30) NOT NULL,
        "quantity"          numeric(18,2) NOT NULL,
        "carrier_user_id"   uuid NULL,
        "status"            varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "superseded_by_id"  uuid NULL,
        "notes"             text NULL,
        "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"        varchar NOT NULL,
        CONSTRAINT "PK_temp_warehouse_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CK_temp_wh_lines_quantity_positive" CHECK ("quantity" > 0),
        CONSTRAINT "FK_temp_wh_lines_session"
          FOREIGN KEY ("session_id") REFERENCES "temp_warehouse_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_temp_wh_lines_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_temp_wh_lines_superseded"
          FOREIGN KEY ("superseded_by_id") REFERENCES "temp_warehouse_lines"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_temp_wh_lines_session_status"
        ON "temp_warehouse_lines" ("session_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_temp_wh_lines_session_item"
        ON "temp_warehouse_lines" ("session_id", "item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_temp_wh_lines_session_item"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_temp_wh_lines_session_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "temp_warehouse_lines"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_temp_wh_sessions_processing"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_temp_wh_sessions_org_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_temp_wh_one_active_per_branch"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "temp_warehouse_sessions"`);
  }
}
