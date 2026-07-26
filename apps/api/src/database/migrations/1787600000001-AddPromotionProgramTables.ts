import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normalized schema for CTKM (promotion programs) — 7 tables + 15 enums.
 * Does not touch the legacy `promotions` / `discount_codes` / `invoice_promotions`
 * tables (TKT-KM-01, EPIC-22072026 scope table).
 *
 * `promotion_lines.target_id` is polymorphic across `items` / `products` /
 * `inventory_item_categories` — deliberately not an FK (see docs/26-promotion-design.md
 * section 3.3). `promotion_branches` / `promotion_customer_groups` are join
 * tables (PK-composite + organization_id only, no BaseEntity columns).
 */
export class AddPromotionProgramTables1787600000001
  implements MigrationInterface
{
  name = 'AddPromotionProgramTables1787600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------------
    // Enums (15)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "promotion_program_type_enum" AS ENUM (
        'INVOICE_DISCOUNT', 'ITEM_DISCOUNT', 'TIERED_DISCOUNT', 'GIFT_ITEM', 'BUY_M_GET_N'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_status_enum" AS ENUM ('TRACKING', 'STOPPED')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_apply_to_enum" AS ENUM (
        'ALL_CUSTOMERS', 'CUSTOMER_GROUP', 'BIRTHDAY', 'CARD_TIER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_birthday_match_enum" AS ENUM (
        'EXACT_DAY', 'SAME_WEEK', 'SAME_MONTH', 'RANGE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_discount_mode_enum" AS ENUM ('PERCENT', 'AMOUNT', 'FIXED_PRICE')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_invoice_scope_enum" AS ENUM ('NON_PROMO_ONLY', 'ALL_ITEMS')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_tier_basis_enum" AS ENUM ('QUANTITY', 'ITEM_VALUE', 'INVOICE_VALUE')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_tier_scope_enum" AS ENUM ('PER_ITEM', 'ALL_ITEMS_IN_GROUP')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_target_type_enum" AS ENUM ('PRODUCT', 'ITEM', 'CATEGORY')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_gift_mode_enum" AS ENUM ('ONE_OF', 'ALL_OF')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_buy_get_policy_enum" AS ENUM ('SPECIFIC', 'CHEAPEST')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_line_role_enum" AS ENUM ('CONDITION', 'REWARD')
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_condition_type_enum" AS ENUM (
        'NONE', 'MIN_INVOICE_AMOUNT', 'SPECIFIC_QUANTITY'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_calc_basis_enum" AS ENUM (
        'ALL_ITEMS', 'NON_PROMO_ITEMS', 'ITEM_CATEGORIES'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "promotion_group_match_mode_enum" AS ENUM ('ANY', 'ALL')
    `);

    // ---------------------------------------------------------------------
    // promotion_programs
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "promotion_programs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "code" character varying(20) NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "type" "promotion_program_type_enum" NOT NULL,
        "status" "promotion_status_enum" NOT NULL DEFAULT 'TRACKING',
        "priority" integer NOT NULL DEFAULT 100,
        "apply_to" "promotion_apply_to_enum" NOT NULL DEFAULT 'ALL_CUSTOMERS',
        "birthday_match" "promotion_birthday_match_enum",
        "birthday_before_days" smallint,
        "birthday_after_days" smallint,
        "card_tier_id" uuid,
        "start_date" date,
        "end_date" date,
        "days_of_week" smallint[] NOT NULL DEFAULT '{}',
        "start_time" time,
        "end_time" time,
        "auto_apply" boolean NOT NULL DEFAULT true,
        "invoice_scope" "promotion_invoice_scope_enum",
        "discount_mode" "promotion_discount_mode_enum",
        "discount_value" numeric(18,2),
        "max_discount_amount" numeric(18,2),
        "tier_basis" "promotion_tier_basis_enum",
        "tier_scope" "promotion_tier_scope_enum",
        "target_type" "promotion_target_type_enum",
        "gift_mode" "promotion_gift_mode_enum",
        "buy_get_policy" "promotion_buy_get_policy_enum",
        "buy_quantity" integer,
        "gift_quantity" integer,
        CONSTRAINT "PK_promotion_programs" PRIMARY KEY ("id"),
        CONSTRAINT "uq_promotion_program_org_code" UNIQUE ("organization_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_promotion_programs_org_status_dates"
      ON "promotion_programs" ("organization_id", "status", "start_date", "end_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_promotion_programs_org_priority"
      ON "promotion_programs" ("organization_id", "priority")
    `);

    // ---------------------------------------------------------------------
    // promotion_groups
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "promotion_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "program_id" uuid NOT NULL,
        "ordinal" integer NOT NULL,
        "name" character varying,
        CONSTRAINT "PK_promotion_groups" PRIMARY KEY ("id"),
        CONSTRAINT "uq_promotion_group_program_ordinal" UNIQUE ("program_id", "ordinal"),
        CONSTRAINT "FK_promotion_groups_program" FOREIGN KEY ("program_id")
          REFERENCES "promotion_programs"("id") ON DELETE CASCADE
      )
    `);

    // ---------------------------------------------------------------------
    // promotion_lines
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "promotion_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "program_id" uuid NOT NULL,
        "group_id" uuid NOT NULL,
        "role" "promotion_line_role_enum" NOT NULL,
        "target_type" "promotion_target_type_enum" NOT NULL,
        "target_id" uuid NOT NULL,
        "quantity" numeric(18,2),
        "discount_mode" "promotion_discount_mode_enum",
        "discount_value" numeric(18,2),
        "max_unit_price" numeric(18,2),
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_promotion_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_promotion_lines_program" FOREIGN KEY ("program_id")
          REFERENCES "promotion_programs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotion_lines_group" FOREIGN KEY ("group_id")
          REFERENCES "promotion_groups"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_promotion_lines_program" ON "promotion_lines" ("program_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_promotion_lines_org_target"
      ON "promotion_lines" ("organization_id", "target_type", "target_id")
    `);

    // ---------------------------------------------------------------------
    // promotion_tiers
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "promotion_tiers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "program_id" uuid NOT NULL,
        "group_id" uuid NOT NULL,
        "from_value" numeric(18,2) NOT NULL,
        "to_value" numeric(18,2),
        "discount_mode" "promotion_discount_mode_enum" NOT NULL,
        "discount_value" numeric(18,2) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_promotion_tiers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_promotion_tiers_program" FOREIGN KEY ("program_id")
          REFERENCES "promotion_programs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_promotion_tiers_group" FOREIGN KEY ("group_id")
          REFERENCES "promotion_groups"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_promotion_tiers_group_from" ON "promotion_tiers" ("group_id", "from_value")
    `);

    // ---------------------------------------------------------------------
    // promotion_conditions
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "promotion_conditions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "program_id" uuid NOT NULL,
        "type" "promotion_condition_type_enum" NOT NULL DEFAULT 'NONE',
        "min_amount" numeric(18,2),
        "calc_basis" "promotion_calc_basis_enum",
        "group_match_mode" "promotion_group_match_mode_enum",
        "multiply_gift" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_promotion_conditions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_promotion_condition_program" UNIQUE ("program_id"),
        CONSTRAINT "FK_promotion_conditions_program" FOREIGN KEY ("program_id")
          REFERENCES "promotion_programs"("id") ON DELETE CASCADE
      )
    `);

    // ---------------------------------------------------------------------
    // promotion_branches (join table — no BaseEntity columns)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "promotion_branches" (
        "program_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "organization_id" character varying NOT NULL,
        CONSTRAINT "PK_promotion_branches" PRIMARY KEY ("program_id", "branch_id"),
        CONSTRAINT "FK_promotion_branches_program" FOREIGN KEY ("program_id")
          REFERENCES "promotion_programs"("id") ON DELETE CASCADE
      )
    `);

    // ---------------------------------------------------------------------
    // promotion_customer_groups (join table — no BaseEntity columns)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "promotion_customer_groups" (
        "program_id" uuid NOT NULL,
        "customer_group_id" uuid NOT NULL,
        "organization_id" character varying NOT NULL,
        CONSTRAINT "PK_promotion_customer_groups" PRIMARY KEY ("program_id", "customer_group_id"),
        CONSTRAINT "FK_promotion_customer_groups_program" FOREIGN KEY ("program_id")
          REFERENCES "promotion_programs"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "promotion_customer_groups"`);
    await queryRunner.query(`DROP TABLE "promotion_branches"`);
    await queryRunner.query(`DROP TABLE "promotion_conditions"`);

    await queryRunner.query(`DROP INDEX "IDX_promotion_tiers_group_from"`);
    await queryRunner.query(`DROP TABLE "promotion_tiers"`);

    await queryRunner.query(`DROP INDEX "IDX_promotion_lines_org_target"`);
    await queryRunner.query(`DROP INDEX "IDX_promotion_lines_program"`);
    await queryRunner.query(`DROP TABLE "promotion_lines"`);

    await queryRunner.query(`DROP TABLE "promotion_groups"`);

    await queryRunner.query(`DROP INDEX "IDX_promotion_programs_org_priority"`);
    await queryRunner.query(`DROP INDEX "IDX_promotion_programs_org_status_dates"`);
    await queryRunner.query(`DROP TABLE "promotion_programs"`);

    await queryRunner.query(`DROP TYPE "promotion_group_match_mode_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_calc_basis_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_condition_type_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_line_role_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_buy_get_policy_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_gift_mode_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_target_type_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_tier_scope_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_tier_basis_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_invoice_scope_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_discount_mode_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_birthday_match_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_apply_to_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_status_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_program_type_enum"`);
  }
}
