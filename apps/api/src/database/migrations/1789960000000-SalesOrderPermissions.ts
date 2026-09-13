import { MigrationInterface, QueryRunner } from 'typeorm';
import { PERMISSION_LABELS_VI } from '@erp/shared-interfaces';

/**
 * Năm quyền của đơn hàng tư vấn, CẤP theo khoá mỏ neo — `PermissionSyncService`
 * lúc boot chỉ ghi bảng `permissions`, không ghi `role_permissions`, nên thêm
 * key mà không cấp là mọi lệnh gọi 403 với mọi người.
 *
 * Cache quyền ở Redis TTL 300s: sau deploy, người dùng có thể phải chờ 5 phút
 * hoặc đăng nhập lại.
 */
const NEW_KEYS = [
  'pos.sales-order.read',
  'pos.sales-order.create',
  'pos.sales-order.cancel',
  'pos.sales-order.approve',
  'pos.sales-order.reject',
];

const IMPLIED_BY: { held: string; grant: string[] }[] = [
  // Ai bán được (tư vấn, thu ngân, admin) thì gửi / xem / huỷ đơn của mình.
  { held: 'pos.sale.create', grant: ['pos.sales-order.read', 'pos.sales-order.create', 'pos.sales-order.cancel'] },
  // Ai thu tiền được (thu ngân) thì nhận xử lý / từ chối.
  {
    held: 'accounting.cash_receipt.create',
    grant: ['pos.sales-order.read', 'pos.sales-order.approve', 'pos.sales-order.reject'],
  },
];

export class SalesOrderPermissions1789960000000 implements MigrationInterface {
  name = 'SalesOrderPermissions1789960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of NEW_KEYS) {
      await queryRunner.query(
        `INSERT INTO permissions (key, description, module) VALUES ($1, $2, 'pos') ON CONFLICT (key) DO NOTHING`,
        [key, PERMISSION_LABELS_VI[key] ?? key],
      );
    }

    for (const { held, grant } of IMPLIED_BY) {
      await queryRunner.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT rp.role_id, target.id
           FROM role_permissions rp
           JOIN permissions held ON held.id = rp.permission_id AND held.key = $1
           JOIN permissions target ON target.key = ANY($2::text[])
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [held, grant],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key = ANY($1::text[]))`,
      [NEW_KEYS],
    );
    await queryRunner.query(`DELETE FROM permissions WHERE key = ANY($1::text[])`, [NEW_KEYS]);
  }
}
