import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inter-branch deposit transfer header — GĐ4 (EPIC-15072026 / TKT-DFB-01).
 *
 * `deposit_transfer` links the two legs of a transfer (a `bank_payments` row at
 * the source branch, a `bank_receipts` row at the destination branch, once
 * confirmed). The intermediate "money in transit" state is modeled by COA 113
 * "Tiền đang chuyển" as the contra of both legs — it already exists from GĐ2
 * (TKT-DFS-06's coa-seeder.service.ts DEFAULT_COA), so this migration only
 * verifies it via the seeder, it does not touch the chart of accounts.
 *
 * `deposit_movements.transfer_pair_id` / `transfer_status` already exist from
 * GĐ1 (1786500000000-DepositFundFoundation) — this migration does NOT alter
 * deposit_movements at all, only reads/writes those pre-existing columns at
 * the application layer.
 *
 * `deposit_transfer_status` is a NEW, separate Postgres enum from GĐ1's
 * `deposit_transfer_status_enum` (used by deposit_movements.transfer_status,
 * 2 values) — this table needs a third value (DA_HUY, cancel) that the
 * movement-level column never holds, so reusing that type would either widen
 * a column that should never see DA_HUY or require an unwanted ALTER TYPE.
 *
 * organization_id/branch_id are varchar (not uuid) to match every other
 * deposit-fund table; id defaults use uuid_generate_v4() (uuid-ossp), not
 * gen_random_uuid() (pgcrypto is not enabled in this DB).
 */
export class DepositTransfer1786900000000 implements MigrationInterface {
  name = 'DepositTransfer1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "deposit_transfer_status" AS ENUM ('DANG_CHUYEN', 'HOAN_TAT', 'DA_HUY')`,
    );

    await queryRunner.query(`
      CREATE TABLE "deposit_transfer" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"   varchar NOT NULL,
        "from_branch_id"    varchar NOT NULL,
        "to_branch_id"      varchar NOT NULL,
        "from_account_id"   uuid NOT NULL,
        "to_account_id"     uuid NOT NULL,
        "amount"            numeric(18,2) NOT NULL,
        "status"            "deposit_transfer_status" NOT NULL DEFAULT 'DANG_CHUYEN',
        "from_payment_id"   uuid NOT NULL,
        "to_receipt_id"     uuid NULL,
        "transfer_pair_id"  uuid NOT NULL,
        "initiated_by"      varchar NOT NULL,
        "initiated_at"      timestamptz NOT NULL,
        "confirmed_by"      varchar NULL,
        "confirmed_at"      timestamptz NULL,
        "cancelled_by"      varchar NULL,
        "cancelled_at"      timestamptz NULL,
        "cancel_reason"     text NULL,
        "note"              text NULL,
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "updated_at"        timestamptz NOT NULL DEFAULT now(),
        "deleted_at"        timestamptz NULL,
        CONSTRAINT "PK_deposit_transfer" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_deposit_transfer_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "FK_deposit_transfer_from_account"
          FOREIGN KEY ("from_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_deposit_transfer_to_account"
          FOREIGN KEY ("to_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_deposit_transfer_from_payment"
          FOREIGN KEY ("from_payment_id") REFERENCES "bank_payments"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_deposit_transfer_to_receipt"
          FOREIGN KEY ("to_receipt_id") REFERENCES "bank_receipts"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_deposit_transfer_org_status" ON "deposit_transfer" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_transfer_from_branch" ON "deposit_transfer" ("from_branch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_transfer_to_branch" ON "deposit_transfer" ("to_branch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_transfer_from_account" ON "deposit_transfer" ("from_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_transfer_to_account" ON "deposit_transfer" ("to_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deposit_transfer_created_at" ON "deposit_transfer" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_transfer_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_transfer_to_account"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_transfer_from_account"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_transfer_to_branch"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_transfer_from_branch"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deposit_transfer_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_transfer"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "deposit_transfer_status"`);
  }
}
