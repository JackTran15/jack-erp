import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMembershipCardTypes1782000000000 implements MigrationInterface {
  name = 'AddMembershipCardTypes1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "membership_card_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "name" character varying(255) NOT NULL,
        "tier" "public"."membership_tier_enum" NOT NULL,
        "description" character varying(500),
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_membership_card_types" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_membership_card_types_org_tier"
      ON "membership_card_types" ("organization_id", "tier")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_membership_card_types_org_tier"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "membership_card_types"`);
  }
}
