import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill customer group codes (Mã nhóm khách hàng). Existing groups were
 * created with code = NULL.
 *
 * (1) assign "NKHxxxxxx" to every code-less group, numbered per organization
 *     in stable (created_at, id) order, continuing after any code already
 *     issued in that org;
 * (2) seed the org-level CUSTOMER_GROUP numbering rule (matches the runtime
 *     default: prefix NKH, continuous 6-digit, never reset) so runtime
 *     generation reuses the same counter;
 * (3) advance the rule's counter to the high-water mark so the next generated
 *     code never collides with a backfilled one.
 *
 * Requires AddCustomerGroupDocumentType (the CUSTOMER_GROUP enum value) to be
 * applied first.
 */
export class BackfillCustomerGroupCode1786300000003
  implements MigrationInterface
{
  name = 'BackfillCustomerGroupCode1786300000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // (1) Backfill codes for groups missing one.
    await queryRunner.query(`
      WITH numbered AS (
        SELECT
          g.id,
          ROW_NUMBER() OVER (
            PARTITION BY g.organization_id
            ORDER BY g.created_at, g.id
          )
          + COALESCE((
              SELECT MAX(CAST(SUBSTRING(g2.code FROM 4) AS INTEGER))
              FROM customer_groups g2
              WHERE g2.organization_id = g.organization_id
                AND g2.code ~ '^NKH[0-9]+$'
            ), 0) AS seq
        FROM customer_groups g
        WHERE g.code IS NULL
      )
      UPDATE customer_groups t
      SET code = 'NKH' || LPAD(numbered.seq::text, 6, '0')
      FROM numbered
      WHERE t.id = numbered.id
    `);

    // (2) Seed an org-level CUSTOMER_GROUP rule for each org that lacks one.
    await queryRunner.query(`
      INSERT INTO document_number_rules
        ("organization_id", "branch_id", "document_type", "prefix", "suffix",
         "include_date", "date_format", "sequence_length", "reset_policy",
         "is_active", "created_by")
      SELECT
        g.organization_id, NULL, 'CUSTOMER_GROUP', 'NKH', NULL,
        false, 'YYYYMM', 6, 'NEVER', true, MIN(g.created_by)
      FROM customer_groups g
      WHERE NOT EXISTS (
        SELECT 1 FROM document_number_rules r
        WHERE r.organization_id = g.organization_id
          AND r.branch_id IS NULL
          AND r.document_type = 'CUSTOMER_GROUP'
          AND r.is_active = true
      )
      GROUP BY g.organization_id
    `);

    // (3) Advance the counter to the highest backfilled sequence per org.
    //     reset_key 'NEVER' matches computeResetKey(ResetPolicy.NEVER).
    await queryRunner.query(`
      INSERT INTO document_number_counters
        ("rule_id", "organization_id", "branch_id", "current_value", "reset_key")
      SELECT r.id, r.organization_id, NULL, hw.max_seq, 'NEVER'
      FROM document_number_rules r
      JOIN (
        SELECT organization_id,
               MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)) AS max_seq
        FROM customer_groups
        WHERE code ~ '^NKH[0-9]+$'
        GROUP BY organization_id
      ) hw ON hw.organization_id = r.organization_id
      WHERE r.document_type = 'CUSTOMER_GROUP'
        AND r.branch_id IS NULL
        AND r.is_active = true
      ON CONFLICT ON CONSTRAINT "UQ_rule_reset_key" DO UPDATE
        SET "current_value" = GREATEST(
          document_number_counters."current_value",
          EXCLUDED."current_value"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Destructive on revert: also clears codes generated after this migration.
    await queryRunner.query(`
      DELETE FROM document_number_counters c
      USING document_number_rules r
      WHERE c.rule_id = r.id AND r.document_type = 'CUSTOMER_GROUP'
    `);
    await queryRunner.query(
      `DELETE FROM document_number_rules WHERE document_type = 'CUSTOMER_GROUP'`,
    );
    await queryRunner.query(
      `UPDATE customer_groups SET code = NULL WHERE code ~ '^NKH[0-9]+$'`,
    );
  }
}
