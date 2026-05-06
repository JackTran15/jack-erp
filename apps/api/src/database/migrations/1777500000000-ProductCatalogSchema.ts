import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductCatalogSchema1777500000000 implements MigrationInterface {
  name = 'ProductCatalogSchema1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "default_provider_id" uuid,
        "auto_migrated" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_provider" FOREIGN KEY ("default_provider_id") REFERENCES "inventory_providers"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_products_org_active" ON "products" ("organization_id", "is_active")`);

    await queryRunner.query(`
      CREATE TABLE "product_attribute_definitions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "product_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_product_attribute_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pad_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_pad_product_name" UNIQUE ("product_id", "name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_attribute_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "attribute_definition_id" uuid NOT NULL,
        "value_label" character varying NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "code_suffix" character varying,
        CONSTRAINT "PK_product_attribute_options" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pao_definition" FOREIGN KEY ("attribute_definition_id") REFERENCES "product_attribute_definitions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_pao_definition" ON "product_attribute_options" ("attribute_definition_id")`);

    await queryRunner.query(`
      CREATE TABLE "item_attribute_values" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "item_id" uuid NOT NULL,
        "attribute_definition_id" uuid NOT NULL,
        "option_id" uuid NOT NULL,
        CONSTRAINT "PK_item_attribute_values" PRIMARY KEY ("id"),
        CONSTRAINT "FK_iav_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_iav_definition" FOREIGN KEY ("attribute_definition_id") REFERENCES "product_attribute_definitions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_iav_option" FOREIGN KEY ("option_id") REFERENCES "product_attribute_options"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_iav_item_definition" UNIQUE ("item_id", "attribute_definition_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_storage_locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" character varying NOT NULL,
        "branch_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" character varying NOT NULL,
        "product_id" uuid NOT NULL,
        "storage_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        CONSTRAINT "PK_product_storage_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_psl_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_psl_product_storage" UNIQUE ("product_id", "storage_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_psl_storage_location" ON "product_storage_locations" ("storage_id", "location_id")`);

    await queryRunner.query(`ALTER TABLE "items" ADD "product_id" uuid`);
    await queryRunner.query(`ALTER TABLE "items" ADD "variant_label" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "items" ADD CONSTRAINT "FK_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "FK_items_product"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "variant_label"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "product_id"`);
    await queryRunner.query(`DROP TABLE "product_storage_locations"`);
    await queryRunner.query(`DROP TABLE "item_attribute_values"`);
    await queryRunner.query(`DROP TABLE "product_attribute_options"`);
    await queryRunner.query(`DROP TABLE "product_attribute_definitions"`);
    await queryRunner.query(`DROP TABLE "products"`);
  }
}
