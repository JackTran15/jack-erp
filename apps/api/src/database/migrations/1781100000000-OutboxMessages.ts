import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transactional Outbox — generic infrastructure shared by all publishers.
 *
 * Publishers `enqueue` an event row inside the same transaction as their business
 * write (atomic), and a background relay publishes pending rows to Kafka. Closes
 * the dual-write gap: source committed ⟺ outbox row exists ⟺ event is published.
 */
export class OutboxMessages1781100000000 implements MigrationInterface {
  name = 'OutboxMessages1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "outbox_messages" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  uuid NULL,
        "branch_id"        uuid NULL,
        "topic"            varchar(255) NOT NULL,
        "event_id"         uuid NOT NULL,
        "partition_key"    varchar(255) NULL,
        "payload"          jsonb NOT NULL,
        "published_at"     timestamptz NULL,
        "attempts"         int NOT NULL DEFAULT 0,
        "next_attempt_at"  timestamptz NOT NULL DEFAULT now(),
        "last_error"       text NULL,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_messages" PRIMARY KEY ("id")
      )
    `);

    // Partial index: the poller only scans unpublished rows (cheap).
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_pending" ON "outbox_messages" ("next_attempt_at") WHERE "published_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_outbox_pending"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_messages"`);
  }
}
