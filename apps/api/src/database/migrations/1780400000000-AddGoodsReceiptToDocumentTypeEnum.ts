import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add 'GOODS_RECEIPT' to the document_number_rules document-type enum.
 *
 */
export class AddGoodsReceiptToDocumentTypeEnum1780400000000
  implements MigrationInterface
{
  name = 'AddGoodsReceiptToDocumentTypeEnum1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'GOODS_RECEIPT'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentional no-op — see header comment.
  }
}
