import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extend the document_number_rules document-type enum with the remaining code
 * types from the organization's standard document-code table (sales, inventory,
 * cash, bank, accounting and master-data codes). Postgres enum values are
 * append-only — `down` is intentionally a no-op.
 */
export class AddDocumentTypesFromConfigTable1780800000000
  implements MigrationInterface
{
  name = 'AddDocumentTypesFromConfigTable1780800000000';

  private readonly values = [
    'QUOTATION', // PBH
    'TRANSFER_ORDER', // LDC
    'STOCK_COUNT', // KK
    'CASH_RECEIPT', // PT
    'CASH_PAYMENT', // PC
    'CASH_COUNT', // KKQ
    'BANK_RECEIPT', // NTTK
    'BANK_PAYMENT', // UNC
    'EXPENSE', // CP
    'RECONCILIATION', // DS
    'DEBT_OFFSET', // BTCN
    'CUSTOMER', // KH
    'SUPPLIER', // NCC
    'DELIVERY_PARTNER', // DTGH
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of this.values) {
      await queryRunner.query(
        `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support dropping an enum value — intentional no-op.
  }
}
