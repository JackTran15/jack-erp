import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Points the INVOICE and RETURN numbering rules at the format customers read off
 * a printed receipt: `2608210001` for a sale, `2608210001TH` for a return or an
 * exchange. Both share one shape and are told apart by the suffix, so a sale and
 * a return issued on the same day never collide on `uq_invoice_org_code`.
 *
 * Rules are updated in place rather than deactivated-and-replaced: the rule id
 * stays valid, so the existing `document_number_counters` rows keep pointing at
 * it, and the two partial unique indexes on the table never come into play. The
 * old counter rows are keyed `2026-08` while a DAILY policy asks for
 * `2026-08-22`, so they simply stop being read — nothing to clean up.
 *
 * Existing invoice codes are NOT rewritten. A posted document is immutable, and
 * `INV-202608-00013` has already been printed, reported on and receipted
 * against. Old and new formats coexist; internal numbers are allowed to jump.
 */
export class SetInvoiceNumberFormatYymmdd1789300100000
  implements MigrationInterface
{
  name = 'SetInvoiceNumberFormatYymmdd1789300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `YYMMDDxxxx` carries no branch segment, so per-branch counters would have
    // two branches issue the same code on the same day — and `uq_invoice_org_code`
    // is (organization_id, code). Failing the deploy is the cheap version of that
    // discovery; the expensive version is a 23505 at the till mid-checkout.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM document_number_rules
          WHERE document_type IN ('INVOICE', 'RETURN')
            AND is_active AND branch_id IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'Active branch-scoped INVOICE/RETURN numbering rules exist; the YYMMDDxxxx format has no branch segment and would collide on uq_invoice_org_code. Deactivate them first.';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      UPDATE "document_number_rules"
         SET "prefix" = '',
             "suffix" = NULL,
             "include_date" = true,
             "date_format" = 'YYMMDD',
             "sequence_length" = 4,
             "separator" = '',
             "reset_policy" = 'DAILY'
       WHERE "document_type" = 'INVOICE' AND "is_active"
    `);

    await queryRunner.query(`
      UPDATE "document_number_rules"
         SET "prefix" = '',
             "suffix" = 'TH',
             "include_date" = true,
             "date_format" = 'YYMMDD',
             "sequence_length" = 4,
             "separator" = '',
             "reset_policy" = 'DAILY'
       WHERE "document_type" = 'RETURN' AND "is_active"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "document_number_rules"
         SET "prefix" = 'INV',
             "suffix" = NULL,
             "include_date" = true,
             "date_format" = 'YYYYMM',
             "sequence_length" = 5,
             "separator" = '-',
             "reset_policy" = 'MONTHLY'
       WHERE "document_type" = 'INVOICE' AND "is_active"
    `);

    await queryRunner.query(`
      UPDATE "document_number_rules"
         SET "prefix" = 'RTN',
             "suffix" = NULL,
             "include_date" = true,
             "date_format" = 'YYYYMM',
             "sequence_length" = 5,
             "separator" = '-',
             "reset_policy" = 'MONTHLY'
       WHERE "document_type" = 'RETURN' AND "is_active"
    `);
  }
}
