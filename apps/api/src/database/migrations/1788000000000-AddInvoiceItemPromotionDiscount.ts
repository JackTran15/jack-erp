import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Materialises the promotion engine's per-line discount allocation onto
 * `invoice_items`.
 *
 * The engine already computes this allocation and stores it in
 * `invoice_checkout_promotions.line_discounts` (jsonb), but nothing ever wrote
 * it back to the line. Every per-line consumer — most importantly the return
 * refund — therefore read the gross `line_total` and paid out more cash than
 * the customer ever handed over.
 *
 * Deliberately additive and defaulted, never folded into `line_total`:
 * `subtotal = SUM(line_total)` is an invariant several reports rely on, and the
 * goods-sold / goods-returned figures built on it are correct today. A consumer
 * that wants the net line amount subtracts this column itself.
 *
 * Note the two discount columns now sitting side by side and the boundary
 * between them: `line_discount` is what the cashier typed and it DOES reduce
 * `line_total`; `promotion_discount` is what the engine allocated and it does
 * NOT.
 */
export class AddInvoiceItemPromotionDiscount1788000000000
  implements MigrationInterface
{
  name = 'AddInvoiceItemPromotionDiscount1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "promotion_discount" numeric(18,2) NOT NULL DEFAULT 0`,
    );

    // Backfill from the jsonb snapshot the engine has been writing all along.
    // SUM + GROUP BY rather than a direct assignment: one line can receive a
    // discount from several programmes, and each programme is its own row in
    // `invoice_checkout_promotions`.
    await queryRunner.query(`
      UPDATE "invoice_items" it
      SET "promotion_discount" = agg.total
      FROM (
        SELECT (e->>'lineId')::uuid AS line_id,
               SUM((e->>'discountAmount')::numeric) AS total
        FROM "invoice_checkout_promotions" p,
             jsonb_array_elements(p."line_discounts") e
        WHERE p."line_discounts" IS NOT NULL
        GROUP BY 1
      ) agg
      WHERE it."id" = agg.line_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "promotion_discount"`,
    );
  }
}
