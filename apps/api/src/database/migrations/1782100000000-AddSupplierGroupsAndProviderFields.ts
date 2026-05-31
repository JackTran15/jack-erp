import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `provider_groups` table (Nhóm nhà cung cấp) with a self-referencing
 * parent hierarchy, and extends `inventory_providers` with the full supplier
 * field set (type org/individual, group FK, debt limits, bank details, contact
 * person, national ID). Existing rows are backfilled with type='organization'.
 * The `supplier_debts.supplier_id → inventory_providers(id)` FK is untouched.
 */
export class AddSupplierGroupsAndProviderFields1782100000000
  implements MigrationInterface
{
  name = 'AddSupplierGroupsAndProviderFields1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Create enum type for inventory_providers.type ──────────────────
    // Name MUST match TypeORM's default: <table>_<column>_enum
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "inventory_providers_type_enum" AS ENUM ('organization', 'individual');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    // ── 2. Create provider_groups table ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_groups" (
        "id"              uuid                     NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying        NOT NULL,
        "branch_id"       character varying,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_by"      character varying        NOT NULL,
        "code"            character varying(50)    NOT NULL,
        "name"            character varying(200)   NOT NULL,
        "parent_group_id" uuid,
        "description"     text,
        "is_active"       boolean                  NOT NULL DEFAULT true,
        CONSTRAINT "PK_provider_groups" PRIMARY KEY ("id"),
        CONSTRAINT "uq_provider_group_org_code" UNIQUE ("organization_id", "code"),
        CONSTRAINT "FK_provider_groups_parent" FOREIGN KEY ("parent_group_id")
          REFERENCES "provider_groups"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_provider_group_parent"
       ON "provider_groups" ("parent_group_id")`,
    );

    // ── 3. Extend inventory_providers with new columns ────────────────────
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "type" "inventory_providers_type_enum" NOT NULL DEFAULT 'organization'`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "address" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "group_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "max_debt" numeric(18,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "debt_term_days" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "bank_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "bank_account_number" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "bank_branch" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "is_customer" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "tax_code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "contact_title" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "contact_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "contact_email" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "contact_phone" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "contact_position" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "contact_address" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "salutation" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "id_card_number" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "id_card_issue_date" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_providers"
       ADD COLUMN IF NOT EXISTS "id_card_issue_place" character varying`,
    );

    // ── 4. Add FK group_id → provider_groups ─────────────────────────────
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "inventory_providers"
          ADD CONSTRAINT "FK_inventory_providers_group"
          FOREIGN KEY ("group_id") REFERENCES "provider_groups"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_inventory_providers_group"
       ON "inventory_providers" ("group_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_inventory_providers_org_type"
       ON "inventory_providers" ("organization_id", "type")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_inventory_providers_org_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_inventory_providers_group"`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "inventory_providers"
          DROP CONSTRAINT IF EXISTS "FK_inventory_providers_group";
      EXCEPTION WHEN others THEN NULL; END $$;`,
    );

    const dropColumns = [
      'type',
      'address',
      'group_id',
      'max_debt',
      'debt_term_days',
      'bank_name',
      'bank_account_number',
      'bank_branch',
      'is_customer',
      'tax_code',
      'contact_title',
      'contact_name',
      'contact_email',
      'contact_phone',
      'contact_position',
      'contact_address',
      'salutation',
      'id_card_number',
      'id_card_issue_date',
      'id_card_issue_place',
    ];
    for (const col of dropColumns) {
      await queryRunner.query(
        `ALTER TABLE "inventory_providers" DROP COLUMN IF EXISTS "${col}"`,
      );
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_provider_group_parent"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "provider_groups"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "inventory_providers_type_enum"`,
    );
  }
}
