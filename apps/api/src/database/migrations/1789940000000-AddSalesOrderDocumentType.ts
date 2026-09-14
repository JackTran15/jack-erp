import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giá trị enum mới phải ở migration RIÊNG: `migrationsTransactionMode: 'each'`,
 * và Postgres không cho dùng một giá trị enum trong cùng transaction vừa thêm nó.
 */
export class AddSalesOrderDocumentType1789940000000 implements MigrationInterface {
  name = 'AddSalesOrderDocumentType1789940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'SALES_ORDER'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres không gỡ được một giá trị enum; giữ nguyên.
  }
}
