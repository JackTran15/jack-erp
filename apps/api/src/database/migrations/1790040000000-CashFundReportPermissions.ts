import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  PERMISSION_LABELS_VI,
  REPORT_DOMAIN_PERMISSIONS,
  reportPermissionsOfDomain,
} from '@erp/shared-interfaces';

/** The keys this migration introduces: the `cash` report domain (Quỹ tiền). */
const NEW_KEYS: string[] = [
  REPORT_DOMAIN_PERMISSIONS.cash.floor,
  REPORT_DOMAIN_PERMISSIONS.cash.consolidated,
  ...reportPermissionsOfDomain('cash'),
];

/**
 * Which existing grant implies which new grants.
 *
 * Whoever may open the debt reports today reconciles cash too, so the cash-fund
 * group and its five reports follow the debts floor; the chain-wide key follows
 * the debts chain-wide key. Tightening happens afterwards, per role, from the
 * role editor — not silently, in a migration.
 */
const IMPLIED_BY: { held: string; grant: string[] }[] = [
  {
    held: REPORT_DOMAIN_PERMISSIONS.debts.floor,
    grant: [REPORT_DOMAIN_PERMISSIONS.cash.floor, ...reportPermissionsOfDomain('cash')],
  },
  {
    held: REPORT_DOMAIN_PERMISSIONS.debts.consolidated,
    grant: [REPORT_DOMAIN_PERMISSIONS.cash.consolidated],
  },
];

/**
 * Permissions of the cash-fund report domain, inserted here rather than left to
 * `PermissionSyncService` for the same reason as 1789700000000: step 2 needs the
 * permission ids to exist. The permission cache (Redis, 300s) is not invalidated
 * from here — a role edited by this migration can serve stale permissions for up
 * to five minutes after deploy.
 */
export class CashFundReportPermissions1790040000000 implements MigrationInterface {
  name = 'CashFundReportPermissions1790040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const key of NEW_KEYS) {
      await queryRunner.query(
        `INSERT INTO permissions (key, description, module)
         VALUES ($1, $2, 'reporting')
         ON CONFLICT (key) DO NOTHING`,
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
      `DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE key = ANY($1::text[]))`,
      [NEW_KEYS],
    );
    await queryRunner.query(`DELETE FROM permissions WHERE key = ANY($1::text[])`, [
      NEW_KEYS,
    ]);
  }
}
