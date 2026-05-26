/**
 * Re-sync permission catalogue + assign full catalogue to seeded system admin role.
 * Use when new permissions were added to permissions.seed.ts but role_permissions
 * was not updated (e.g. after EPIC cash vouchers).
 *
 * Run: pnpm --filter @erp/api seed:sync-admin-permissions
 *
 * Dev admin: inventory.admin@erp.local → role "Quản trị hệ thống"
 * (role id 40000000-0000-4000-8000-000000000001)
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

const SEED_ORG_ID = '10000000-0000-4000-8000-000000000001';
const ROLE_SYSTEM_ADMIN = '40000000-0000-4000-8000-000000000001';
const ROLE_GENERAL_MANAGER = '40000000-0000-4000-8000-000000000003';
const ROLE_BRANCH_MANAGER = '40000000-0000-4000-8000-000000000004';
const ROLE_STAFF = '40000000-0000-4000-8000-000000000005';

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
  let assigned = 0;
  for (const key of permissionKeys) {
    const result = await AppDataSource.query(
      `
      INSERT INTO role_permissions (id, role_id, permission_id)
      SELECT gen_random_uuid(), $1, p.id
      FROM permissions p
      WHERE p.key = $2
      ON CONFLICT (role_id, permission_id) DO NOTHING
      `,
      [roleId, key],
    );
    if (result[1] > 0) assigned += 1;
  }
  return assigned;
}

async function run(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await upsertPermissions();
    console.log(`Upserted ${PERMISSION_SEEDS.length} permissions from catalogue.`);

    const adminCount = await assignPermissionsToRole(
      ROLE_SYSTEM_ADMIN,
      SYSTEM_ADMIN_PERMISSION_KEYS,
    );
    console.log(
      `Role "${SEED_ROLE_NAMES.SYSTEM_ADMIN}" (${ROLE_SYSTEM_ADMIN}): ${adminCount} permission links.`,
    );

    await assignPermissionsToRole(
      ROLE_GENERAL_MANAGER,
      GENERAL_MANAGER_PERMISSION_KEYS,
    );
    await assignPermissionsToRole(
      ROLE_BRANCH_MANAGER,
      BRANCH_MANAGER_PERMISSION_KEYS,
    );
    await assignPermissionsToRole(ROLE_STAFF, STAFF_PERMISSION_KEYS);

    const users = await AppDataSource.query<
      { email: string; role_name: string }[]
    >(
      `
      SELECT u.email, r.name AS role_name
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id AND ur.organization_id = u.organization_id
      JOIN roles r ON r.id = ur.role_id
      WHERE u.organization_id = $1
        AND u.email IN ('inventory.admin@erp.local', 'admin@erp.local')
      `,
      [SEED_ORG_ID],
    );
    console.log('Dev users and roles:', users);

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
