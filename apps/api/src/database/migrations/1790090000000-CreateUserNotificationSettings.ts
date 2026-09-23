import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-user notification preference — ONE row per user, matching the mobile
 * "Thiết lập thông báo" screen: a scope (whole chain or one branch) plus the set
 * of enabled types. No row = each type's `defaultEnabled`.
 */
export class CreateUserNotificationSettings1790090000000 implements MigrationInterface {
  name = 'CreateUserNotificationSettings1790090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_notification_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "scope_branch_id" uuid,
        "enabled_types" text[] NOT NULL DEFAULT '{}',
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_notification_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_notification_settings_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_user_notification_settings_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(`COMMENT ON TABLE "user_notification_settings" IS 'Notification preference, one row per user'`);
    await queryRunner.query(`COMMENT ON COLUMN "user_notification_settings"."scope_branch_id" IS 'null = whole chain; otherwise only notifications from this branch'`);
    await queryRunner.query(`COMMENT ON COLUMN "user_notification_settings"."enabled_types" IS 'Notification type codes the user wants; absent = off'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_notification_settings"`);
  }
}
