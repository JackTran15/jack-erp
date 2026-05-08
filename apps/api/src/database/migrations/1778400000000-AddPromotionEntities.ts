import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromotionEntities1778400000000 implements MigrationInterface {
  name = 'AddPromotionEntities1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "discount_type_enum" AS ENUM ('percentage', 'fixed_amount')
    `);

    await queryRunner.query(`
      CREATE TYPE "promotion_type_enum" AS ENUM ('order_discount', 'gift_product', 'buy_x_get_y', 'product_discount')
    `);

    await queryRunner.query(`
      CREATE TYPE "invoice_promotion_type_enum" AS ENUM ('discount_code', 'voucher', 'promotion')
    `);

    await queryRunner.query(`
      CREATE TABLE "discount_codes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "code" character varying NOT NULL,
        "discount_type" "discount_type_enum" NOT NULL,
        "discount_value" numeric(18,2) NOT NULL,
        "min_order_value" numeric(18,2) NOT NULL DEFAULT 0,
        "max_uses" integer,
        "used_count" integer NOT NULL DEFAULT 0,
        "valid_from" TIMESTAMP WITH TIME ZONE NOT NULL,
        "valid_to" TIMESTAMP WITH TIME ZONE NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_discount_codes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_discount_code_org" UNIQUE ("organization_id", "code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vouchers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "code" character varying NOT NULL,
        "face_value" numeric(18,2) NOT NULL,
        "customer_id" uuid,
        "valid_from" TIMESTAMP WITH TIME ZONE NOT NULL,
        "valid_to" TIMESTAMP WITH TIME ZONE NOT NULL,
        "is_used" boolean NOT NULL DEFAULT false,
        "redeemed_invoice_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_vouchers" PRIMARY KEY ("id"),
        CONSTRAINT "uq_voucher_org_code" UNIQUE ("organization_id", "code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "promotions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "name" character varying NOT NULL,
        "type" "promotion_type_enum" NOT NULL,
        "conditions" jsonb,
        "benefits" jsonb,
        "valid_from" TIMESTAMP WITH TIME ZONE NOT NULL,
        "valid_to" TIMESTAMP WITH TIME ZONE NOT NULL,
        "applicable_branch_ids" text[] NOT NULL DEFAULT '{}',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_promotions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_promotions_org_active" ON "promotions" ("organization_id", "is_active")`);

    await queryRunner.query(`
      CREATE TABLE "invoice_promotions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "invoice_id" uuid NOT NULL,
        "promotion_type" "invoice_promotion_type_enum" NOT NULL,
        "ref_id" uuid NOT NULL,
        "discount_amount" numeric(18,2) NOT NULL,
        "note" text,
        CONSTRAINT "PK_invoice_promotions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invoice_promotions_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_invoice_promotions_invoice_id" ON "invoice_promotions" ("invoice_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_invoice_promotions_invoice_id"`);
    await queryRunner.query(`DROP TABLE "invoice_promotions"`);
    await queryRunner.query(`DROP INDEX "IDX_promotions_org_active"`);
    await queryRunner.query(`DROP TABLE "promotions"`);
    await queryRunner.query(`DROP TABLE "vouchers"`);
    await queryRunner.query(`DROP TABLE "discount_codes"`);
    await queryRunner.query(`DROP TYPE "invoice_promotion_type_enum"`);
    await queryRunner.query(`DROP TYPE "promotion_type_enum"`);
    await queryRunner.query(`DROP TYPE "discount_type_enum"`);
  }
}
