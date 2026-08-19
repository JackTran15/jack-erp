import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * api_keys — named credentials a third-party integration uses instead of a
 * user JWT to call the existing API (feature `api-key-auth`,
 * `.ai/features/api-key-auth`). `AuthGuard` accepts either a valid JWT or a
 * valid `X-Api-Key` header once this table exists (T-02-02/T-02-03).
 *
 * Only a SHA-256 hash of the raw key is stored (`key_hash`), never the
 * plaintext; `key_prefix` is a short, non-secret identifier for the admin
 * list. `branch_ids` NULL means the key is not restricted to a subset of the
 * organization's branches. `ip_whitelist` holds IPv4 addresses and/or CIDR
 * ranges as a JSON array of strings.
 *
 * `user_id` (ADR-04, added when G2 reopened) points at a real, never-loginable
 * "shadow user" row created alongside the key — `PermissionGuard`/
 * `RbacService` resolve permissions from a DB `user_roles` lookup keyed on
 * `userId` and never read anything off the request payload, so this is the
 * only way an API-key-authenticated request can pass any permission check.
 * `roles` still lists the role ids granted, but only to populate that
 * shadow user's `user_roles`, not as something read at request time.
 */
export class CreateApiKeys1788700000000 implements MigrationInterface {
  name = 'CreateApiKeys1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id"               uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"  varchar NOT NULL,
        "user_id"          uuid NOT NULL,
        "name"             varchar(255) NOT NULL,
        "key_prefix"       varchar(16) NOT NULL,
        "key_hash"         varchar(64) NOT NULL,
        "roles"            text[] NOT NULL DEFAULT '{}',
        "branch_ids"       text[] NULL,
        "ip_whitelist"     jsonb NOT NULL DEFAULT '[]',
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"       TIMESTAMP NULL,
        "created_by"       varchar NOT NULL,
        CONSTRAINT "PK_api_keys" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_api_keys_key_hash" UNIQUE ("key_hash"),
        CONSTRAINT "FK_api_keys_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_api_keys_organization" ON "api_keys" ("organization_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
  }
}
