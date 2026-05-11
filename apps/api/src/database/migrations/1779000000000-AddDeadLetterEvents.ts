import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeadLetterEvents1779000000000 implements MigrationInterface {
  name = 'AddDeadLetterEvents1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "dead_letter_status_enum" AS ENUM ('PENDING', 'RESOLVED', 'IGNORED')
    `);

    await queryRunner.query(`
      CREATE TABLE "dead_letter_events" (
        "id"               UUID            NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"  UUID            NOT NULL,
        "branch_id"        UUID,
        "topic"            VARCHAR(255)    NOT NULL,
        "partition"        INTEGER,
        "offset"           BIGINT,
        "key"              VARCHAR(255),
        "payload"          JSONB           NOT NULL,
        "error"            TEXT,
        "retry_count"      INTEGER         NOT NULL DEFAULT 3,
        "status"           "dead_letter_status_enum" NOT NULL DEFAULT 'PENDING',
        "resolved_by"      UUID,
        "resolved_at"      TIMESTAMPTZ,
        "notes"            TEXT,
        "created_at"       TIMESTAMPTZ     NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ     NOT NULL DEFAULT now(),
        "created_by"       UUID,
        CONSTRAINT "PK_dead_letter_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_dle_status_topic" ON "dead_letter_events" ("status", "topic")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dle_org_created" ON "dead_letter_events" ("organization_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dle_org_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dle_status_topic"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dead_letter_events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "dead_letter_status_enum"`);
  }
}
