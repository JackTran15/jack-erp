import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  INVENTORY_VALUE_PERMISSION,
  PERMISSION_LABELS_VI,
  REPORT_DOMAIN_PERMISSIONS,
  REPORT_PERMISSION_KEYS,
  reportPermissionsOfDomain,
} from '@erp/shared-interfaces';

/** The keys this migration introduces, with the module the catalogue files them under. */
const NEW_KEYS: string[] = [
  ...Object.values(REPORT_PERMISSION_KEYS),
  REPORT_DOMAIN_PERMISSIONS.profit.consolidated,
  REPORT_DOMAIN_PERMISSIONS.debts.consolidated,
  INVENTORY_VALUE_PERMISSION,
];

/**
 * Which existing grant implies which new grants.
 *
 * Reports move from four coarse group keys to one key per report. Nobody may
 * lose access on deploy, so every role holding a group key is given that group's
 * per-report keys. Tightening happens afterwards, per role, from the role editor
 * — not silently, in a migration.
 */
const IMPLIED_BY: { held: string; grant: string[] }[] = [
  {
    held: REPORT_DOMAIN_PERMISSIONS.sales.floor,
    grant: reportPermissionsOfDomain('sales'),
  },
  {
    held: REPORT_DOMAIN_PERMISSIONS.profit.floor,
    grant: reportPermissionsOfDomain('profit'),
  },
  {
    held: REPORT_DOMAIN_PERMISSIONS.debts.floor,
    grant: reportPermissionsOfDomain('debts'),
  },
  {
    held: REPORT_DOMAIN_PERMISSIONS.inventory.floor,
    grant: [
      ...reportPermissionsOfDomain('inventory'),
      // Value columns were visible to everyone who could open a stock report,
      // so holders keep them. The new permission only becomes a restriction
      // once someone unticks it.
      INVENTORY_VALUE_PERMISSION,
    ],
  },
  {
    // Profit reports used to read the *invoice* consolidated key. Now that each
    // money domain carries its own, holders of the old one keep the reach they
    // had — otherwise this deploy would quietly demote them to branch scope.
    held: REPORT_DOMAIN_PERMISSIONS.sales.consolidated,
    grant: [
      REPORT_DOMAIN_PERMISSIONS.profit.consolidated,
      REPORT_DOMAIN_PERMISSIONS.debts.consolidated,
    ],
  },
];

/**
 * One permission per report, plus the per-domain consolidated keys and the
 * inventory value key.
 *
 * The rows are inserted here rather than left to `PermissionSyncService`: that
 * runs `OnApplicationBootstrap`, i.e. *after* migrations, and step 2 below needs
 * the permission ids to exist. The sync service still runs afterwards and will
 * only refresh descriptions.
 *
 * Note the permission cache (Redis `rbac:perms:{userId}:{orgId}`, 300s) is not
 * invalidated from here — a role edited by this migration can serve stale
 * permissions for up to five minutes after deploy.
 */
export class GranularReportPermissions1789700000000
  implements MigrationInterface
{
  name = 'GranularReportPermissions1789700000000';

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

  /**
   * Drops the grants and then the permissions themselves. The `role_permissions`
   * delete is redundant if the FK cascades, but stating it keeps the rollback
   * correct whichever way the constraint is defined.
   */
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
