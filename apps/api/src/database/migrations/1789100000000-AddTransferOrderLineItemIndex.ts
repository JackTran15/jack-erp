import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `transfer_order_lines` carried a single index, on `transfer_order_id`
 * (IDX_transfer_order_lines_order). Every read that starts from an item and asks
 * "is any of this in transit?" therefore scanned the whole table.
 *
 * The stock summary does exactly that twice per request — once for the page rows
 * (`pendingTransferQuery`) and once for the footer (`pending` CTE in
 * `buildTotalsSql`) — and both join `line.item_id` with `line.organization_id`.
 */
export class AddTransferOrderLineItemIndex1789100000000
  implements MigrationInterface
{
  name = 'AddTransferOrderLineItemIndex1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transfer_order_lines_org_item"
      ON "transfer_order_lines" ("organization_id", "item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transfer_order_lines_org_item"`,
    );
  }
}
