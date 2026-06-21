import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill warehouse codes (Mã kho) now that code is system-assigned and
 * display-only on the form. Existing storages — including the showroom storage
 * auto-created per branch — were created with code = NULL.
 *
 * (1) assign "WHxxxxxx" to every code-less storage, numbered per organization
 *     in stable (created_at, id) order, continuing after any code already
 *     issued in that org;
 * (2) seed the org-level WAREHOUSE numbering rule (matches the runtime default:
 *     prefix WH, continuous 6-digit, never reset) so runtime generation reuses
 *     the same counter;
 * (3) advance the rule's counter to the high-water mark so the next generated
 *     code never collides with a backfilled one.
 *
 * Requires AddWarehouseDocumentType (the WAREHOUSE enum value) to be applied
 * first.
 */
export class BackfillStorageCode1784800000001 implements MigrationInterface {
  name = 'BackfillStorageCode1784800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // (1) Backfill codes for storages missing one.
    await queryRunner.query(`
      WITH numbered AS (
        SELECT
          s.id,
          ROW_NUMBER() OVER (
            PARTITION BY s.organization_id
            ORDER BY s.created_at, s.id
          )
          + COALESCE((
              SELECT MAX(CAST(SUBSTRING(s2.code FROM 3) AS INTEGER))
              FROM storages s2
              WHERE s2.organization_id = s.organization_id
                AND s2.code ~ '^WH[0-9]+$'
            ), 0) AS seq
        FROM storages s
        WHERE s.code IS NULL
      )
      UPDATE storages t
      SET code = 'WH' || LPAD(numbered.seq::text, 6, '0')
      FROM numbered
      WHERE t.id = numbered.id
    `);

    // (2) Seed an org-level WAREHOUSE rule for each org that lacks one.
    await queryRunner.query(`
      INSERT INTO document_number_rules
        ("organization_id", "branch_id", "document_type", "prefix", "suffix",
         "include_date", "date_format", "sequence_length", "reset_policy",
         "is_active", "created_by")
      SELECT
        s.organization_id, NULL, 'WAREHOUSE', 'WH', NULL,
        false, 'YYYYMM', 6, 'NEVER', true, MIN(s.created_by)
      FROM storages s
      WHERE NOT EXISTS (
        SELECT 1 FROM document_number_rules r
        WHERE r.organization_id = s.organization_id
          AND r.branch_id IS NULL
          AND r.document_type = 'WAREHOUSE'
          AND r.is_active = true
      )
      GROUP BY s.organization_id
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
               MAX(CAST(SUBSTRING(code FROM 3) AS INTEGER)) AS max_seq
        FROM storages
        WHERE code ~ '^WH[0-9]+$'
        GROUP BY organization_id
      ) hw ON hw.organization_id = r.organization_id
      WHERE r.document_type = 'WAREHOUSE'
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
      WHERE c.rule_id = r.id AND r.document_type = 'WAREHOUSE'
    `);
    await queryRunner.query(
      `DELETE FROM document_number_rules WHERE document_type = 'WAREHOUSE'`,
    );
    await queryRunner.query(
      `UPDATE storages SET code = NULL WHERE code ~ '^WH[0-9]+$'`,
    );
  }
}
