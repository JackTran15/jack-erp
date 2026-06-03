import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds composite/partial indexes aligned with list and hot-path queries in services:
 * - POS catalog (items + stock_balances)
 * - Invoice / cash voucher lists (org + branch + status + sort column)
 * - Outbox relay poll + cleanup
 * - Stock ledger, journal idempotency, inventory document lists
 */
export class AddQueryPerformanceIndexes1781700000000 implements MigrationInterface {
  name = 'AddQueryPerformanceIndexes1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // POS: stock_balances lookup by org + branch (+ optional item_id IN (...))
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_balances_org_branch_item"
      ON "stock_balances" ("organization_id", "branch_id", "item_id")
    `);

    // POS catalog: active, visible items per org (join from stock_balances)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_org_pos_catalog"
      ON "items" ("organization_id")
      WHERE "is_active" = true AND "is_pos_visible" = true
    `);

    // POS variants: items by product within org
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_org_product"
      ON "items" ("organization_id", "product_id")
      WHERE "product_id" IS NOT NULL
    `);

    // Inventory admin: filter by category + active flag
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_org_active_category"
      ON "items" ("organization_id", "is_active", "category_id")
    `);

    // invoice.service findAll: org + branch + status, ORDER BY created_at DESC
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invoices_org_branch_status_created"
      ON "invoices" ("organization_id", "branch_id", "status", "created_at" DESC)
    `);

    // customer-summary.service: org + customer + type + status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invoices_org_customer_type_status"
      ON "invoices" ("organization_id", "customer_id", "type", "status")
    `);

    // cash-receipts/payments list: default branch scope + status + voucher_date sort
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cash_receipts_org_branch_list"
      ON "cash_receipts" ("organization_id", "branch_id", "status", "voucher_date" DESC)
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cash_payments_org_branch_list"
      ON "cash_payments" ("organization_id", "branch_id", "status", "voucher_date" DESC)
      WHERE "deleted_at" IS NULL
    `);

    // outbox-relay: poll pending rows ordered by created_at; cleanup published rows
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_outbox_pending"`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_outbox_pending"
      ON "outbox_messages" ("next_attempt_at", "created_at")
      WHERE "published_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_outbox_published_cleanup"
      ON "outbox_messages" ("published_at")
      WHERE "published_at" IS NOT NULL
    `);

    // stock-ledger.service getLedgerEntries: org + branch, ORDER BY posted_at DESC
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_ledger_org_branch_posted"
      ON "stock_ledger_entries" ("organization_id", "branch_id", "posted_at" DESC)
    `);

    // journal.service findBySourceRef + list with branch + posted_at sort
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_journal_org_source_ref_status"
      ON "journal_entries" ("organization_id", "source_reference_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_journal_org_branch_posted"
      ON "journal_entries" ("organization_id", "branch_id", "posted_at" DESC)
    `);

    // goods-receipt.service list: org + branch + status, ORDER BY received_at DESC
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_goods_receipts_org_branch_list"
      ON "goods_receipts" ("organization_id", "branch_id", "status", "received_at" DESC)
    `);

    // BaseCrudService branch-scoped customer lists
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customers_org_branch_status"
      ON "customers" ("organization_id", "branch_id", "status")
    `);

    // BaseCrudService / domain list endpoints: org + branch + status + created_at
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_goods_issues_org_branch_list"
      ON "goods_issues" ("organization_id", "branch_id", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_purchase_orders_org_branch_list"
      ON "purchase_orders" ("organization_id", "branch_id", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_transfers_org_branch_list"
      ON "stock_transfers" ("organization_id", "branch_id", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_takes_org_branch_list"
      ON "stock_takes" ("organization_id", "branch_id", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transfer_orders_org_branch_list"
      ON "transfer_orders" ("organization_id", "branch_id", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_adjustments_org_branch_list"
      ON "stock_adjustments" ("organization_id", "branch_id", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expenses_org_branch_list"
      ON "expenses" ("organization_id", "branch_id", "status", "created_at" DESC)
    `);

    // customer-summary: redeemed points by card + type
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_point_history_card_type"
      ON "point_history" ("card_id", "type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_point_history_card_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expenses_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_adjustments_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transfer_orders_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_takes_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_transfers_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_orders_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_goods_issues_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_org_branch_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_goods_receipts_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_org_branch_posted"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_journal_org_source_ref_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_ledger_org_branch_posted"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_outbox_published_cleanup"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_outbox_pending"`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_outbox_pending"
      ON "outbox_messages" ("next_attempt_at")
      WHERE "published_at" IS NULL
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_payments_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cash_receipts_org_branch_list"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_org_customer_type_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_org_branch_status_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_org_active_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_org_product"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_org_pos_catalog"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_balances_org_branch_item"`);
  }
}
