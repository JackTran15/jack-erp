import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index for the anchor lookup in
 * `TempWarehouseService.resolveFulfillPostedAt`: the earliest SALE_ISSUE row of
 * one invoice, which every temp-warehouse-served sale now reads once in order to
 * place its compensating transfer ahead of the sale in the stock card.
 *
 * `stock_ledger_entries` carries indexes on (org, branch, created_at),
 * (org, item, location) and (org, posted_at) — none of them usable here, so the
 * lookup planned as a parallel sequential scan (~17ms over 221k rows on
 * erp_dev_3008, and growing linearly with the ledger). Paid once per sale, on an
 * append-only table that only ever gets bigger.
 *
 * Partial on the sale leg because that is the only shape the query asks for, and
 * it keeps the index off every receipt, transfer and adjustment row — the vast
 * majority of the table. `posted_at` is the trailing column so the ORDER BY is
 * served from the index rather than by sorting the matched rows.
 *
 * Plain CREATE INDEX, not CONCURRENTLY: TypeORM runs each migration inside a
 * transaction, and CONCURRENTLY cannot run in one.
 */
export class AddStockLedgerInvoiceAnchorIndex1789700000000
  implements MigrationInterface
{
  name = 'AddStockLedgerInvoiceAnchorIndex1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_ledger_invoice_sale_anchor"
        ON "stock_ledger_entries" ("organization_id", "reference_id", "posted_at")
        WHERE "reference_type" = 'INVOICE' AND "movement_type" = 'SALE_ISSUE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_stock_ledger_invoice_sale_anchor"`,
    );
  }
}
