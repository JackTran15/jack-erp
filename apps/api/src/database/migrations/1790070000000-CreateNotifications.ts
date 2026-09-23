import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * In-app notification inbox — one row per (recipient × notification).
 *
 * `data` is jsonb because every notification type carries a different set of
 * template variables; adding a type never needs a migration. The unique key
 * `(source_event_id, type, user_id)` is the first idempotency layer: replaying
 * the same domain event never creates a second row for the same person.
 */
export class CreateNotifications1790070000000 implements MigrationInterface {
  name = 'CreateNotifications1790070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" character varying(64) NOT NULL,
        "branch_id" uuid,
        "data" jsonb NOT NULL DEFAULT '{}',
        "target" jsonb,
        "source_event_id" uuid NOT NULL,
        "actor_id" uuid,
        "read_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notifications_event_type_user" UNIQUE ("source_event_id", "type", "user_id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_user_unread" ON "notifications" ("user_id") WHERE "read_at" IS NULL`,
    );
    await queryRunner.query(`COMMENT ON TABLE "notifications" IS 'In-app notification inbox, one row per recipient'`);
    await queryRunner.query(`COMMENT ON COLUMN "notifications"."type" IS 'Notification type code (wire contract, never renamed): invoice, invoice_return, ...'`);
    await queryRunner.query(`COMMENT ON COLUMN "notifications"."branch_id" IS 'Branch the event happened in; null = organization-level'`);
    await queryRunner.query(`COMMENT ON COLUMN "notifications"."data" IS 'Raw template variables (code, amount, actor, store, product, more, date); clients render text'`);
    await queryRunner.query(`COMMENT ON COLUMN "notifications"."target" IS 'Semantic deep-link target {type, id?, slug?, branchId?}; each app maps it to its own route'`);
    await queryRunner.query(`COMMENT ON COLUMN "notifications"."source_event_id" IS 'Domain event id (or deterministic uuidv5 for scheduled runs) that produced this row'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
