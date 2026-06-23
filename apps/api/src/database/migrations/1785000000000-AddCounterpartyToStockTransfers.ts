import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add an explicit "Đối tượng" (counterparty) to stock transfer documents so the
 * v2 flow can target a supplier (NCC), customer (KH) or employee (NV) — the same
 * picker used by goods receipt / goods issue. Reuses the existing
 * doc_counterparty_kind_enum (no CREATE TYPE). Columns are nullable so existing
 * transfers stay valid; their "Đối tượng" continues to fall back to the
 * transporter user (transporter_user_id is kept untouched).
 */
export class AddCounterpartyToStockTransfers1785000000000
  implements MigrationInterface
{
  name = 'AddCounterpartyToStockTransfers1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN "counterparty_kind" "doc_counterparty_kind_enum" NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" ADD COLUMN "counterparty_id" uuid NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "counterparty_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP COLUMN IF EXISTS "counterparty_kind"`,
    );
  }
}
