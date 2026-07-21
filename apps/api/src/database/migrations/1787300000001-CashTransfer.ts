import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Inter-branch cash transfer header (EPIC-21072026).
 *
 * `cash_transfer` links the source leg (a `cash_payments` row at the initiating
 * branch, purpose INTER_BRANCH_OUT) to the destination leg, which is either a
 * `cash_receipts` row (to_fund_kind = CASH) or a `bank_receipts` row
 * (to_fund_kind = DEPOSIT) once the destination branch confirms. The
 * intermediate "money in transit" state is modeled by COA 113 "Tiền đang
 * chuyển" as the contra of both legs — the same account deposit_transfer and
 * fund swaps already use, so this migration does not touch the chart of
 * accounts.
 *
 * `status` deliberately reuses the existing `deposit_transfer_status` type
 * (1786900000000-DepositTransfer): the lifecycle vocabulary is identical
 * (DANG_CHUYEN / HOAN_TAT / DA_HUY), so a duplicate type would only add drift.
 *
 * `to_receipt_id` has no foreign key on purpose — the destination row lives in
 * cash_receipts or bank_receipts depending on to_fund_kind, and Postgres has no
 * multi-table foreign key.
 *
 * organization_id/branch_id are varchar (not uuid) to match every other
 * treasury table; id defaults use uuid_generate_v4() (uuid-ossp), not
 * gen_random_uuid() (pgcrypto is not enabled in this DB).
 */
export class CashTransfer1787300000001 implements MigrationInterface {
  name = 'CashTransfer1787300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "cash_transfer_fund_kind" AS ENUM ('CASH', 'DEPOSIT')`,
    );

    await queryRunner.query(`
      CREATE TABLE "cash_transfer" (
        "id"                    uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"       varchar NOT NULL,
        "from_branch_id"        varchar NOT NULL,
        "to_branch_id"          varchar NOT NULL,
        "from_cash_account_id"  uuid NOT NULL,
        "to_fund_kind"          "cash_transfer_fund_kind" NOT NULL,
        "to_cash_account_id"    uuid NULL,
        "to_deposit_account_id" uuid NULL,
        "amount"                numeric(18,2) NOT NULL,
        "status"                "deposit_transfer_status" NOT NULL DEFAULT 'DANG_CHUYEN',
        "from_payment_id"       uuid NOT NULL,
        "to_receipt_id"         uuid NULL,
        "transfer_pair_id"      uuid NOT NULL,
        "initiated_by"          varchar NOT NULL,
        "initiated_at"          timestamptz NOT NULL,
        "confirmed_by"          varchar NULL,
        "confirmed_at"          timestamptz NULL,
        "cancelled_by"          varchar NULL,
        "cancelled_at"          timestamptz NULL,
        "cancel_reason"         text NULL,
        "note"                  text NULL,
        "created_at"            timestamptz NOT NULL DEFAULT now(),
        "updated_at"            timestamptz NOT NULL DEFAULT now(),
        "deleted_at"            timestamptz NULL,
        CONSTRAINT "PK_cash_transfer" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_cash_transfer_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "CHK_cash_transfer_destination" CHECK (
          ("to_fund_kind" = 'CASH'
            AND "to_cash_account_id" IS NOT NULL AND "to_deposit_account_id" IS NULL)
          OR
          ("to_fund_kind" = 'DEPOSIT'
            AND "to_deposit_account_id" IS NOT NULL AND "to_cash_account_id" IS NULL)
        ),
        CONSTRAINT "FK_cash_transfer_from_cash_account"
          FOREIGN KEY ("from_cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_transfer_to_cash_account"
          FOREIGN KEY ("to_cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_transfer_to_deposit_account"
          FOREIGN KEY ("to_deposit_account_id") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_transfer_from_payment"
          FOREIGN KEY ("from_payment_id") REFERENCES "cash_payments"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_cash_transfer_org_status" ON "cash_transfer" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cash_transfer_from_branch" ON "cash_transfer" ("from_branch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cash_transfer_to_branch" ON "cash_transfer" ("to_branch_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_cash_transfer_created_at" ON "cash_transfer" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_transfer_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_transfer_to_branch"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_transfer_from_branch"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cash_transfer_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_transfer"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cash_transfer_fund_kind"`);
  }
}
