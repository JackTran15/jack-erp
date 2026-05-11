import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessedEvents1779600000000 implements MigrationInterface {
  name = 'AddProcessedEvents1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "processed_events" (
        "consumer_name"    VARCHAR(255) NOT NULL,
        "event_id"         UUID         NOT NULL,
        "topic"            VARCHAR(255) NOT NULL,
        "organization_id"  UUID,
        "processed_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_processed_events" PRIMARY KEY ("consumer_name", "event_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_processed_events_processed_at" ON "processed_events" ("processed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_processed_events_processed_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "processed_events"`);
  }
}
