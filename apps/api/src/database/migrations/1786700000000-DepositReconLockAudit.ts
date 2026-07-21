import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconcile / period-lock / audit schema — GĐ3 (EPIC-15072026 / TKT-DFR-01).
 *
 * Creates 3 foundation tables:
 *   - deposit_recon_batch   (bank-statement reconciliation batch, FR-09)
 *   - deposit_period_lock   (period close with closing-balance snapshot, FR-12/BR-LOCK-03)
 *   - deposit_audit_log     (append-only audit trail, NFR-05)
 *
 * The reconciliation/fee/value-date columns on deposit_movements
 * (recon_status, recon_batch_id, reconciled_by/at, fee_amount, net_amount,
 * value_date) and deposit_payment_policy (fee_rate, fee_bearer,
 * settlement_days) already exist from GĐ1 (1786500000000-DepositFundFoundation)
 * — this migration only adds the FK from deposit_movements.recon_batch_id to
 * the new deposit_recon_batch table (GĐ1 left it unconstrained).
 *
 * organization_id/branch_id are varchar (not uuid) to match every other
 * deposit-fund table; id defaults use uuid_generate_v4() (uuid-ossp), not
 * gen_random_uuid() (pgcrypto is not enabled in this DB).
 */
export class DepositReconLockAudit1786700000000 implements MigrationInterface {
  name = 'DepositReconLockAudit1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums --------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "deposit_recon_batch_status_enum" AS ENUM ('RECONCILED', 'DISCREPANCY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "deposit_period_lock_status_enum" AS ENUM ('LOCKED', 'UNLOCKED')`,
    );

    // ---- deposit_recon_batch --------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "deposit_recon_batch" (
        "id"                    uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"       varchar NOT NULL,
        "branch_id"             varchar NOT NULL,
        "deposit_account_id"    uuid NOT NULL,
        "batch_number"          varchar NULL,
        "stmt_from_date"        date NOT NULL,
        "stmt_to_date"          date NOT NULL,
        "stmt_total_amount"     numeric(18,2) NOT NULL,
        "system_total_amount"   numeric(18,2) NOT NULL,
        "diff_amount"           numeric(18,2) NOT NULL,
        "status"                "deposit_recon_batch_status_enum" NOT NULL,
        "note"                  text NULL,
        "reconciled_by"         varchar NULL,
        "reconciled_at"         timestamptz NULL,
        "created_at"            timestamptz NOT NULL DEFAULT now(),
        "updated_at"            timestamptz NOT NULL DEFAULT now(),
        "deleted_at"            timestamptz NULL,
        CONSTRAINT "PK_deposit_recon_batch" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_deposit_recon_batch_number" UNIQUE ("organization_id", "batch_number"),
        CONSTRAINT "FK_deposit_recon_batch_account"
          FOREIGN KEY ("deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_recon_batch_scope" ON "deposit_recon_batch" ("organization_id", "branch_id", "deposit_account_id")`,
    );

    // FK from GĐ1's deposit_movements.recon_batch_id (left unconstrained there).
    await queryRunner.query(`
      ALTER TABLE "deposit_movements"
        ADD CONSTRAINT "FK_deposit_movements_recon_batch"
        FOREIGN KEY ("recon_batch_id") REFERENCES "deposit_recon_batch"("id") ON DELETE RESTRICT
    `);

    // ---- deposit_period_lock ----------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "deposit_period_lock" (
        "id"                        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"           varchar NOT NULL,
        "branch_id"                 varchar NOT NULL,
        "period"                    varchar(7) NOT NULL,
        "status"                    "deposit_period_lock_status_enum" NOT NULL DEFAULT 'LOCKED',
        "closing_balance_snapshot"  jsonb NOT NULL,
        "locked_by"                 varchar NOT NULL,
        "locked_at"                 timestamptz NOT NULL,
        "unlocked_by"               varchar NULL,
        "unlocked_at"               timestamptz NULL,
        "unlock_reason"             text NULL,
        "created_at"                timestamptz NOT NULL DEFAULT now(),
        "updated_at"                timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deposit_period_lock" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_deposit_period_lock" UNIQUE ("organization_id", "branch_id", "period")
      )
    `);

    // ---- deposit_audit_log (append-only, NFR-05) ---------------------------
    await queryRunner.query(`
      CREATE TABLE "deposit_audit_log" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "branch_id"        varchar NULL,
        "entity_type"      varchar NOT NULL,
        "entity_id"        uuid NOT NULL,
        "action"           varchar NOT NULL,
        "before"           jsonb NULL,
        "after"            jsonb NULL,
        "actor_id"         varchar NOT NULL,
        "reason"           text NULL,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deposit_audit_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_audit_entity" ON "deposit_audit_log" ("organization_id", "entity_type", "entity_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_audit_time" ON "deposit_audit_log" ("organization_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_audit_time"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_audit_entity"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_audit_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_period_lock"`);
    await queryRunner.query(
      `ALTER TABLE "deposit_movements" DROP CONSTRAINT IF EXISTS "FK_deposit_movements_recon_batch"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_recon_batch_scope"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_recon_batch"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_period_lock_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_recon_batch_status_enum"`);
  }
}
