import { MigrationInterface, QueryRunner } from 'typeorm';
import { PERMISSION_LABELS_VI } from '@erp/shared-interfaces';

const KEYS = ['accounting.bank_receipt.create', 'accounting.bank_receipt.read'];

/**
 * Thu ngân thu nợ bằng CHUYỂN KHOẢN trên mobile (erp-sales-cashier, T-17-01):
 * đường đi là saga phiếu thu ngân hàng, tức cần `accounting.bank_receipt.create`.
 * Ai đang cầm quyền lập phiếu thu tiền mặt thì nhận luôn hai khoá này — cùng
 * cách `SalesOrderPermissions` đã cấp theo khoá mỏ neo, để tổ chức đang chạy
 * không bị 403 sau deploy. Seed `CASHIER_PERMISSION_KEYS` đổi song song.
 */
export class CashierBankReceiptPermission1790010000000 implements MigrationInterface {
  name = 'CashierBankReceiptPermission1790010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of KEYS) {
      await queryRunner.query(
        `INSERT INTO permissions (key, description, module) VALUES ($1, $2, 'accounting') ON CONFLICT (key) DO NOTHING`,
        [key, PERMISSION_LABELS_VI[key] ?? key],
      );
    }
    await queryRunner.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT rp.role_id, target.id
         FROM role_permissions rp
         JOIN permissions held ON held.id = rp.permission_id AND held.key = $1
         JOIN permissions target ON target.key = ANY($2::text[])
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      ['accounting.cash_receipt.create', KEYS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ rút khỏi role thu ngân seed (`SEED_ROLE_NAMES.CASHIER`, bảng `roles.name`); admin vốn có sẵn không đổi.
    await queryRunner.query(
      `DELETE FROM role_permissions rp
        USING permissions target, roles r
        WHERE rp.permission_id = target.id AND target.key = ANY($1::text[])
          AND r.id = rp.role_id AND r.name = 'Nhân viên thu ngân'`,
      [KEYS],
    );
  }
}
