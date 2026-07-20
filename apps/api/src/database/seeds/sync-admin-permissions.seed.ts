/**
 * Re-sync permission catalogue + re-assign the standard permission set to every
 * seeded system role, IN EVERY ORGANIZATION (matched by role name, not a
 * hardcoded org/role id). Use when new permissions were added to
 * permissions.seed.ts but role_permissions was not updated (e.g. after EPIC
 * cash vouchers).
 *
 * Run: pnpm --filter @erp/api seed:sync-admin-permissions
 */
import { AppDataSource } from '../data-source';
import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  SEED_ROLE_NAMES,
  STAFF_PERMISSION_KEYS,
  SYSTEM_ADMIN_PERMISSION_KEYS,
} from './org-role-permissions';

const PERMISSION_KEYS_BY_ROLE_NAME: Record<string, string[]> = {
  [SEED_ROLE_NAMES.SYSTEM_ADMIN]: SYSTEM_ADMIN_PERMISSION_KEYS,
  [SEED_ROLE_NAMES.GENERAL_MANAGER]: GENERAL_MANAGER_PERMISSION_KEYS,
  [SEED_ROLE_NAMES.BRANCH_MANAGER]: BRANCH_MANAGER_PERMISSION_KEYS,
  [SEED_ROLE_NAMES.STAFF]: STAFF_PERMISSION_KEYS,
};

async function upsertPermissions(): Promise<void> {
  for (const permission of PERMISSION_SEEDS) {
    await AppDataSource.query(
      `
      INSERT INTO permissions (id, key, description, module)
      VALUES (gen_random_uuid(), $1, $2, $3)
      ON CONFLICT (key) DO UPDATE SET
        description = EXCLUDED.description,
        module = EXCLUDED.module
      `,
      [permission.key, permission.description, permission.module],
    );
  }
}

async function assignPermissionsToRole(
  roleId: string,
  permissionKeys: string[],
): Promise<number> {
  await AppDataSource.query(
    `DELETE FROM role_permissions WHERE role_id = $1`,
    [roleId],
  );
  if (permissionKeys.length === 0) return 0;
  const result = await AppDataSource.query(
    `
    INSERT INTO role_permissions (id, role_id, permission_id)
    SELECT gen_random_uuid(), $1, p.id
    FROM permissions p
    WHERE p.key = ANY($2::text[])
    ON CONFLICT (role_id, permission_id) DO NOTHING
    RETURNING id
    `,
    [roleId, permissionKeys],
  );
  return result.length;
}

async function run(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await upsertPermissions();
    console.log(`Upserted ${PERMISSION_SEEDS.length} permissions from catalogue.`);

    const roles = await AppDataSource.query<
      { id: string; name: string; organization_id: string }[]
    >(
      `SELECT id, name, organization_id FROM roles WHERE name = ANY($1::text[])`,
      [Object.keys(PERMISSION_KEYS_BY_ROLE_NAME)],
    );

    for (const role of roles) {
      const count = await assignPermissionsToRole(
        role.id,
        PERMISSION_KEYS_BY_ROLE_NAME[role.name],
      );
      console.log(
        `Role "${role.name}" (${role.id}, org ${role.organization_id}): ${count} permission links.`,
      );
    }

    console.log(
      'Done. Log out and log in again (or wait for access token refresh) to load new permissions.',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
