import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đơn hàng tư vấn → thu ngân (luồng mobile). Domain riêng, KHÔNG tái dùng
 * `invoices`. `UNIQUE (organization_id, document_number)` ngay từ đầu — repo đã
 * phải vá lỗi unique toàn cục hai lần (1787900000000).
 */
export class CreateSalesOrders1789950000000 implements MigrationInterface {
  name = 'CreateSalesOrders1789950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "sales_order_status_enum" AS ENUM ('SENT', 'PROCESSED', 'REJECTED', 'CANCELLED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "sales_orders" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id"   character varying NOT NULL,
        "branch_id"         character varying,
        "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "created_by"        character varying NOT NULL,
        "document_number"   character varying NOT NULL,
        "status"            "sales_order_status_enum" NOT NULL DEFAULT 'SENT',
        "salesperson_id"    uuid NOT NULL,
        "salesperson_name"  character varying NOT NULL,
        "sales_channel"     character varying NOT NULL,
        "customer_id"       uuid,
        "customer_name"     character varying,
        "customer_phone"    character varying,
        "subtotal"          numeric(18,2) NOT NULL DEFAULT 0,
        "discount"          numeric(18,2) NOT NULL DEFAULT 0,
        "amount_due"        numeric(18,2) NOT NULL DEFAULT 0,
        "note"              character varying,
        "reject_reason"     character varying,
        "approved_by"       uuid,
        "approved_at"       TIMESTAMP WITH TIME ZONE,
        "rejected_by"       uuid,
        "rejected_at"       TIMESTAMP WITH TIME ZONE,
        "cancelled_by"      uuid,
        "cancelled_at"      TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_sales_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sales_orders_org_document_number" UNIQUE ("organization_id", "document_number")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sales_orders_org_branch_status_created" ON "sales_orders" ("organization_id", "branch_id", "status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sales_orders_org_salesperson_created" ON "sales_orders" ("organization_id", "salesperson_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "sales_order_lines" (
        "id"                      uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sales_order_id"          uuid NOT NULL,
        "line_no"                 integer NOT NULL,
        "item_id"                 uuid NOT NULL,
        "item_code"               character varying NOT NULL,
        "item_name"               character varying NOT NULL,
        "unit"                    character varying NOT NULL,
        "quantity"                numeric(18,2) NOT NULL,
        "unit_price"              numeric(18,2) NOT NULL,
        "manual_discount"         numeric(18,2) NOT NULL DEFAULT 0,
        "manual_discount_reason"  character varying,
        "promotion_discount"      numeric(18,2) NOT NULL DEFAULT 0,
        "promotion_name"          character varying,
        "note"                    character varying,
        "line_total"              numeric(18,2) NOT NULL,
        CONSTRAINT "PK_sales_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_order_lines_order" FOREIGN KEY ("sales_order_id")
          REFERENCES "sales_orders"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_sales_order_lines_order" ON "sales_order_lines" ("sales_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_order_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sales_order_status_enum"`);
  }
}
