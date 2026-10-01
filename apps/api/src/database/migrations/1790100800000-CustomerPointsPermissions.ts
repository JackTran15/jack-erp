import { MigrationInterface, QueryRunner } from 'typeorm';
import { PERMISSION_LABELS_VI } from '@erp/shared-interfaces';

const KEYS = ['customer.points.adjust', 'customer.points.history.read'];

/**
 * Điểm thành viên (2026100101 T-01-01): đặt lại số dư điểm và xem lịch sử điểm có
 * quyền riêng. Cấp cho mọi vai trò đang giữ `customer.merge` — khoá mỏ neo cấp quản
 * lý (Quản trị hệ thống, Quản lý tổng, Quản lý chi nhánh); NV bán hàng / thu ngân /
 * kho không giữ nó nên không được cấp. Cùng khuôn `CashierBankReceiptPermission`.
 */
export class CustomerPointsPermissions1790100800000 implements MigrationInterface {
  name = 'CustomerPointsPermissions1790100800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of KEYS) {
      await queryRunner.query(
        `INSERT INTO permissions (key, description, module) VALUES ($1, $2, 'customer') ON CONFLICT (key) DO NOTHING`,
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
      ['customer.merge', KEYS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM role_permissions rp
        USING permissions target
        WHERE rp.permission_id = target.id AND target.key = ANY($1::text[])`,
      [KEYS],
    );
  }
}
