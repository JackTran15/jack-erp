import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * goods_issues and purchase_orders were created (AddPurchaseOrdersAndGoodsIssues)
 * with document_number UNIQUE globally, the same defect fixed for
 * stock_transfers / stock_adjustments in
 * 1787800000000-ScopeStockTransferAdjustmentDocNumberToOrg.
 *
 * DocumentNumberingService generates numbers per-organization, so two
 * different organizations both using continuous "XK######" / "PDH######"
 * numbering can legitimately reach the same formatted string at the same
 * time. The global constraint then rejects the second organization's insert
 * with a duplicate-key error, even though nothing is actually wrong within
 * either organization's own sequence.
 */
export class ScopeGoodsIssuePurchaseOrderDocNumberToOrg1787900000000
  implements MigrationInterface
{
  name = 'ScopeGoodsIssuePurchaseOrderDocNumberToOrg1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "goods_issues"
      DROP CONSTRAINT "goods_issues_document_number_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "goods_issues"
      ADD CONSTRAINT "UQ_goods_issues_org_document_number"
      UNIQUE ("organization_id", "document_number")
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP CONSTRAINT "purchase_orders_document_number_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD CONSTRAINT "UQ_purchase_orders_org_document_number"
      UNIQUE ("organization_id", "document_number")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP CONSTRAINT "UQ_purchase_orders_org_document_number"
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD CONSTRAINT "purchase_orders_document_number_key"
      UNIQUE ("document_number")
    `);

    await queryRunner.query(`
      ALTER TABLE "goods_issues"
      DROP CONSTRAINT "UQ_goods_issues_org_document_number"
    `);
    await queryRunner.query(`
      ALTER TABLE "goods_issues"
      ADD CONSTRAINT "goods_issues_document_number_key"
      UNIQUE ("document_number")
    `);
  }
}
