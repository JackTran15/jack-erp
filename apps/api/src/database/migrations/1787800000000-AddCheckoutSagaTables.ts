import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saga-state tables for the v2 POS checkout flow (`POST /v2/pos/checkout`).
 *
 * `checkout_saga` holds one row per checkout attempt and records the outcome;
 * `checkout_saga_step` holds the ordered per-step trail behind it, which is what
 * the legacy flow has no equivalent of. Follows the house saga pattern of
 * `cash_debt_collection_saga` — the whole checkout runs in one ACID transaction
 * and the row records COMPLETED / FAILED.
 *
 * The unique index is PARTIAL: duplicate suppression must not block a retry
 * after a failed attempt, and failed attempts are written by a second
 * transaction after the main one has rolled back, so several may accumulate for
 * the same key. `idempotency_key` defaults to the invoice id when the client
 * sends no `x-idempotency-key`, which is what makes a single invoice
 * checkout-able exactly once.
 */
export class AddCheckoutSagaTables1787800000000 implements MigrationInterface {
  name = 'AddCheckoutSagaTables1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "checkout_saga_status_enum" AS ENUM ('PENDING', 'COMPLETED', 'COMPENSATED', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "checkout_saga" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "idempotency_key" character varying(200) NOT NULL,
        "correlation_id" character varying(200),
        "invoice_id" uuid,
        "document_number" character varying(64),
        "status" "checkout_saga_status_enum" NOT NULL DEFAULT 'PENDING',
        "current_step" character varying(64),
        "total_steps" integer,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        "duration_ms" integer,
        "error" jsonb,
        CONSTRAINT "PK_checkout_saga" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "checkout_saga_step" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "saga_id" uuid NOT NULL,
        "seq" integer NOT NULL,
        "name" character varying(64) NOT NULL,
        "phase" character varying(16) NOT NULL,
        "status" character varying(16) NOT NULL,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "duration_ms" integer,
        "output" jsonb,
        "error" text,
        CONSTRAINT "PK_checkout_saga_step" PRIMARY KEY ("id"),
        CONSTRAINT "FK_checkout_saga_step_saga" FOREIGN KEY ("saga_id")
          REFERENCES "checkout_saga" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_checkout_saga_org_status" ON "checkout_saga" ("organization_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_checkout_saga_invoice" ON "checkout_saga" ("invoice_id")`,
    );
    // Partial on purpose: a FAILED attempt must not block the retry, and several
    // FAILED rows may exist for one key. See the class comment.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_checkout_saga_idem" ON "checkout_saga" ("organization_id", "idempotency_key") WHERE "status" <> 'FAILED'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_checkout_saga_step_seq" ON "checkout_saga_step" ("saga_id", "seq")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_checkout_saga_step_saga" ON "checkout_saga_step" ("saga_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_checkout_saga_step_saga"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_checkout_saga_step_seq"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_checkout_saga_idem"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_checkout_saga_invoice"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_checkout_saga_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "checkout_saga_step"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "checkout_saga"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "checkout_saga_status_enum"`);
  }
}
