import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * stock_transfers and stock_adjustments were created (InitSchema) with
 * document_number UNIQUE globally, unlike every other document-numbered
 * table (goods_receipts, stock_takes, transfer_orders, pos_sales,
 * receivables, payables, journal_entries, cash/bank vouchers), which all
 * scope uniqueness to (organization_id, document_number).
 *
 * DocumentNumberingService generates numbers per-organization, so two
 * different organizations both using continuous "CK######" / "ADJ######"
 * numbering can legitimately reach the same formatted string at the same
 * time. The global constraint then rejects the second organization's insert
 * with a duplicate-key error, even though nothing is actually wrong within
 * either organization's own sequence.
 */
export class ScopeStockTransferAdjustmentDocNumberToOrg1787800000000
  implements MigrationInterface
{
  name = 'ScopeStockTransferAdjustmentDocNumberToOrg1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      DROP CONSTRAINT "UQ_1bb5e7b35ce2131ca7c5dd7465c"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      ADD CONSTRAINT "UQ_stock_transfers_org_document_number"
      UNIQUE ("organization_id", "document_number")
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      DROP CONSTRAINT "UQ_3364ca02be7ba1cdaa71f5c3b4e"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      ADD CONSTRAINT "UQ_stock_adjustments_org_document_number"
      UNIQUE ("organization_id", "document_number")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      DROP CONSTRAINT "UQ_stock_adjustments_org_document_number"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      ADD CONSTRAINT "UQ_3364ca02be7ba1cdaa71f5c3b4e"
      UNIQUE ("document_number")
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      DROP CONSTRAINT "UQ_stock_transfers_org_document_number"
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      ADD CONSTRAINT "UQ_1bb5e7b35ce2131ca7c5dd7465c"
      UNIQUE ("document_number")
    `);
  }
}
