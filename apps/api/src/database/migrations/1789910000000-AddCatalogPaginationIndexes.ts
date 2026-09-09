import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One index for the POS catalogue list, which moves its pagination from an
 * in-memory pass over the whole org catalogue into SQL.
 *
 * The list is a UNION ALL of two arms — products that still have a POS-visible
 * variant, and standalone POS-visible items. This index serves the EXISTS
 * subquery behind the first arm and the `product_id IS NULL` filter behind the
 * second, and it is the only index that measurably helps.
 *
 * Measured on a production restore (4,731 products, 21,024 items, 2,539
 * catalogue cards), page 1 of the card-key query, mean of 12 runs:
 *
 *   no index                          11.3 ms
 *   this index only                    ~7 ms
 *   dropping this index alone          +1.9 ms
 *
 * Two collated name indexes — products(organization_id, name COLLATE
 * "vi-VN-x-icu") and the standalone-item equivalent — were built and measured
 * first, on the theory that a collation-matched index would let the ORDER BY
 * read pre-sorted. The planner refused both: the UNION has to materialise and
 * sort either way, and at 2,358 matching product rows a seq scan plus sort wins.
 * Dropping them changed nothing. They are not created here, and re-adding them
 * needs a new measurement rather than the old reasoning.
 *
 * The `COLLATE "vi-VN-x-icu"` in the query itself is unrelated to indexing and
 * still required: the database is en_US.utf8, under which a plain ORDER BY name
 * disagreed with the previous JS `localeCompare(name, 'vi')` at 2,198 of 2,539
 * positions — Ao/Áo/Ăn/Âm, D/Đ and E/Ế all order differently.
 *
 * Not built CONCURRENTLY on purpose: TypeORM runs migrations inside a
 * transaction and CONCURRENTLY cannot. Measured at 62 ms on that restore.
 */
export class AddCatalogPaginationIndexes1789910000000
  implements MigrationInterface
{
  name = 'AddCatalogPaginationIndexes1789910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_org_product_pos"
      ON "items" ("organization_id", "product_id")
      WHERE "is_active" AND "is_pos_visible"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_org_product_pos"`);
  }
}
