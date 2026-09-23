import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delivery queue + delivery log for out-of-app channels (FCM push, websocket).
 *
 * Polled by `NotificationDeliveryWorker` with `FOR UPDATE SKIP LOCKED`, the same
 * pattern as `outbox_messages` — no BullMQ. The unique key is the second
 * idempotency layer: one delivery per (notification, channel, device).
 * `NULLS NOT DISTINCT` (Postgres 15+) makes websocket rows (no device) unique too.
 */
export class CreateNotificationDeliveries1790080000000 implements MigrationInterface {
  name = 'CreateNotificationDeliveries1790080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notification_deliveries_status_enum" AS ENUM ('pending', 'retrying', 'sent', 'failed', 'expired', 'dropped');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "notification_id" uuid NOT NULL,
        "channel" character varying(32) NOT NULL,
        "device_id" uuid,
        "status" "notification_deliveries_status_enum" NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_error" text,
        "provider_message_id" character varying(255),
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_deliveries_target" UNIQUE NULLS NOT DISTINCT ("notification_id", "channel", "device_id"),
        CONSTRAINT "FK_notification_deliveries_notification" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notification_deliveries_device" FOREIGN KEY ("device_id") REFERENCES "user_devices"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_deliveries_due" ON "notification_deliveries" ("next_attempt_at") WHERE "status" IN ('pending', 'retrying')`,
    );
    await queryRunner.query(`COMMENT ON TABLE "notification_deliveries" IS 'Per-channel delivery queue and log for notifications'`);
    await queryRunner.query(`COMMENT ON COLUMN "notification_deliveries"."channel" IS 'fcm_push | websocket'`);
    await queryRunner.query(`COMMENT ON COLUMN "notification_deliveries"."status" IS 'pending/retrying = queued; sent; failed = max attempts; expired = too old to be useful; dropped = permanent error (dead token, bad payload)'`);
    await queryRunner.query(`COMMENT ON COLUMN "notification_deliveries"."last_error" IS 'Last provider error code + message, for diagnostics'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_deliveries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_deliveries_status_enum"`);
  }
}
