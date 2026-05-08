import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendCustomerAndMembershipCard1778100000000 implements MigrationInterface {
  name = 'ExtendCustomerAndMembershipCard1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum types
    await queryRunner.query(`CREATE TYPE "gender_enum" AS ENUM ('male', 'female', 'unspecified')`);
    await queryRunner.query(`CREATE TYPE "membership_tier_enum" AS ENUM ('none', 'silver', 'gold', 'diamond')`);
    await queryRunner.query(`CREATE TYPE "point_type_enum" AS ENUM ('earn', 'redeem', 'adjust')`);

    // 2. Create customer_groups before adding the FK column to customers
    await queryRunner.query(`
      CREATE TABLE "customer_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        CONSTRAINT "PK_customer_groups" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_customer_group_org_name" ON "customer_groups" ("organization_id", "name")`);

    // 3. Extend customers table
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "code" varchar(10)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "birth_date" date`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "gender" gender_enum`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "national_id" varchar(12)`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "group_id" uuid REFERENCES customer_groups(id) ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "assigned_staff_id" uuid`);
    await queryRunner.query(`ALTER TABLE "customers" ADD COLUMN "note" text`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_customer_org_code" ON "customers" ("organization_id", "code") WHERE "code" IS NOT NULL`);

    // 4. Create membership_cards
    await queryRunner.query(`
      CREATE TABLE "membership_cards" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "customer_id" uuid NOT NULL,
        "card_number" character varying NOT NULL,
        "tier" membership_tier_enum NOT NULL DEFAULT 'none',
        "points" integer NOT NULL DEFAULT 0,
        "issued_at" date NOT NULL,
        "expires_at" date,
        "lomas_card_number" character varying,
        "lomas_tier" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_membership_cards" PRIMARY KEY ("id"),
        CONSTRAINT "FK_membership_cards_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_membership_card_customer" ON "membership_cards" ("customer_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_membership_card_number" ON "membership_cards" ("organization_id", "card_number")`);

    // 5. Create point_history
    await queryRunner.query(`
      CREATE TABLE "point_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "card_id" uuid NOT NULL,
        "invoice_id" uuid,
        "type" point_type_enum NOT NULL,
        "delta" integer NOT NULL,
        "note" text,
        CONSTRAINT "PK_point_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_point_history_card" FOREIGN KEY ("card_id") REFERENCES "membership_cards"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_point_history_card_id" ON "point_history" ("card_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop point_history
    await queryRunner.query(`DROP TABLE "point_history"`);

    // Drop membership_cards
    await queryRunner.query(`DROP TABLE "membership_cards"`);

    // Revert customers columns
    await queryRunner.query(`DROP INDEX "uq_customer_org_code"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "note"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "assigned_staff_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "group_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "national_id"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "gender"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "birth_date"`);
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "code"`);

    // Drop customer_groups
    await queryRunner.query(`DROP TABLE "customer_groups"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE "point_type_enum"`);
    await queryRunner.query(`DROP TYPE "membership_tier_enum"`);
    await queryRunner.query(`DROP TYPE "gender_enum"`);
  }
}
