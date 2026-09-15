import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `media_objects` — source of truth for every uploaded file (ADR-03,
 * 03-logical-design.md). State machine PENDING -> UPLOADED -> ATTACHED ->
 * DELETED; not a soft-delete table, so no `SoftDeleteEntity` conventions
 * apply here.
 */
export class CreateMediaObjects1789940000000 implements MigrationInterface {
  name = 'CreateMediaObjects1789940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "media_objects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "owner_type" varchar(40) NOT NULL,
        "owner_id" uuid NULL,
        "status" varchar(20) NOT NULL,
        "bucket" varchar(63) NOT NULL,
        "object_key" varchar(300) NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "content_type" varchar(100) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "attached_at" TIMESTAMPTZ NULL,
        "deleted_at" TIMESTAMPTZ NULL,
        "object_removed_at" TIMESTAMPTZ NULL,
        CONSTRAINT "PK_media_objects" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_media_objects_object_key" UNIQUE ("object_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_media_objects_owner_attached"
        ON "media_objects" ("organization_id", "owner_type", "owner_id", "sort_order")
        WHERE "status" = 'ATTACHED'
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_media_objects_cleanup" ON "media_objects" ("status", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "media_objects"`);
  }
}
