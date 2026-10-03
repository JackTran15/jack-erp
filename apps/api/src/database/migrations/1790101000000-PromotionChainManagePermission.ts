import { MigrationInterface, QueryRunner } from 'typeorm';
import { PERMISSION_LABELS_VI } from '@erp/shared-interfaces';

const CHAIN_KEY = 'promotion.chain.manage';
const PROGRAM_KEYS = ['promotion.read', 'promotion.write', 'promotion.delete'];

/**
 * CTKM theo chi nhánh (2026100301 T-01-02, ADR-02).
 *
 * Thứ tự ba bước là bắt buộc:
 * 1. thêm khoá `promotion.chain.manage`;
 * 2. cấp nó cho mọi vai trò ĐANG giữ `promotion.write` — tức ai đang quản lý
 *    CTKM hôm nay (Quản trị hệ thống, Quản lý tổng, vai trò tuỳ biến) giữ
 *    nguyên quyền toàn chuỗi, không ai mất quyền (A-06);
 * 3. cấp `promotion.read/write/delete` cho vai trò giữ `customer.merge` — mỏ neo
 *    cấp quản lý, gồm Quản lý chi nhánh (A-07). Họ chỉ quản lý CTKM của chi
 *    nhánh mình vì không giữ khoá ở bước 2.
 * Đảo bước 2 và 3 thì mọi Quản lý chi nhánh thành quản lý toàn chuỗi.
 */
export class PromotionChainManagePermission1790101000000 implements MigrationInterface {
  name = 'PromotionChainManagePermission1790101000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of [CHAIN_KEY, ...PROGRAM_KEYS]) {
      await queryRunner.query(
        `INSERT INTO permissions (key, description, module) VALUES ($1, $2, 'promotion') ON CONFLICT (key) DO NOTHING`,
        [key, PERMISSION_LABELS_VI[key] ?? key],
      );
    }
    await this.grantToHoldersOf(queryRunner, 'promotion.write', [CHAIN_KEY]);
    await this.grantToHoldersOf(queryRunner, 'customer.merge', PROGRAM_KEYS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 3 only reached roles without the chain key; roles that held
    // promotion.write before `up` also hold the chain key and keep theirs.
    // Lossy edge: a custom role that held only promotion.read/delete before
    // `up` (no write, so no chain key) loses it here — no record says it was
    // there first.
    await queryRunner.query(
      `DELETE FROM role_permissions rp
        USING permissions target
        WHERE rp.permission_id = target.id
          AND target.key = ANY($1::text[])
          AND NOT EXISTS (
            SELECT 1 FROM role_permissions chain
              JOIN permissions ck ON ck.id = chain.permission_id AND ck.key = $2
             WHERE chain.role_id = rp.role_id)`,
      [PROGRAM_KEYS, CHAIN_KEY],
    );
    await queryRunner.query(
      `DELETE FROM role_permissions rp
        USING permissions target
        WHERE rp.permission_id = target.id AND target.key = $1`,
      [CHAIN_KEY],
    );
  }

  private async grantToHoldersOf(queryRunner: QueryRunner, heldKey: string, keys: string[]): Promise<void> {
    await queryRunner.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT rp.role_id, target.id
         FROM role_permissions rp
         JOIN permissions held ON held.id = rp.permission_id AND held.key = $1
         JOIN permissions target ON target.key = ANY($2::text[])
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [heldKey, keys],
    );
  }
}
