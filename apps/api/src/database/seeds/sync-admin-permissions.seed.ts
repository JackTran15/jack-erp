/**
 * Re-sync permission catalogue + re-assign the standard permission set to every
 * seeded system role, IN EVERY ORGANIZATION (matched by role name, not a
 * hardcoded org/role id). Use when new permissions were added to
 * permissions.seed.ts but role_permissions was not updated (e.g. after EPIC
 * cash vouchers).
 *
 * Also the upgrade path for existing organizations after the staff role split:
 * renames "Nhân viên" to "Nhân viên bán hàng" and creates the thu ngân / kho roles.
 *
 * Run: pnpm --filter @erp/api seed:sync-admin-permissions
 */
import { AppDataSource } from '../data-source';
import { returnedRows } from '../../common/utils/returning-rows.util';
import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  CASHIER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  LEGACY_STAFF_ROLE_NAME,
  SALES_PERMISSION_KEYS,
  SEED_ROLE_NAMES,
  SYSTEM_ADMIN_PERMISSION_KEYS,
  WAREHOUSE_PERMISSION_KEYS,
} from './org-role-permissions';

const PERMISSION_KEYS_BY_ROLE_NAME: Record<string, string[]> = {
  [SEED_ROLE_NAMES.SYSTEM_ADMIN]: SYSTEM_ADMIN_PERMISSION_KEYS,
  [SEED_ROLE_NAMES.GENERAL_MANAGER]: GENERAL_MANAGER_PERMISSION_KEYS,
  [SEED_ROLE_NAMES.BRANCH_MANAGER]: BRANCH_MANAGER_PERMISSION_KEYS,
  [SEED_ROLE_NAMES.SALES]: SALES_PERMISSION_KEYS,
  [SEED_ROLE_NAMES.CASHIER]: CASHIER_PERMISSION_KEYS,
  [SEED_ROLE_NAMES.WAREHOUSE]: WAREHOUSE_PERMISSION_KEYS,
};

/** Roles added after the single "Nhân viên" role was split, with their descriptions. */
const ROLES_TO_BACKFILL: { name: string; description: string }[] = [
  {
    name: SEED_ROLE_NAMES.CASHIER,
    description:
      'Bán hàng + quỹ tiền mặt: phiếu thu, phiếu chi, kiểm kê, sổ tiền mặt',
  },
  {
    name: SEED_ROLE_NAMES.WAREHOUSE,
    description: 'Phiếu nhập, phiếu xuất, chuyển kho, kiểm kê kho, báo cáo kho',
  },
];

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

/**
 * The single "Nhân viên" role was split into bán hàng / thu ngân / kho. Rename it
 * in place so every `user_roles` row survives, then create the two new roles for
 * every organization. Both steps are idempotent: the rename is skipped when the
 * target name already exists, the insert when the role is already there.
 */
async function migrateStaffRoles(): Promise<void> {
  const renamedResult: unknown = await AppDataSource.query(
    `
    UPDATE roles r
    SET name = $1::text, updated_at = NOW()
    WHERE r.name = $2::text
      AND NOT EXISTS (
        SELECT 1 FROM roles other
        WHERE other.organization_id = r.organization_id AND other.name = $1::text
      )
    RETURNING r.organization_id
    `,
    [SEED_ROLE_NAMES.SALES, LEGACY_STAFF_ROLE_NAME],
  );
  const renamed = returnedRows<{ organization_id: string }>(renamedResult);
  console.log(
    `Renamed "${LEGACY_STAFF_ROLE_NAME}" -> "${SEED_ROLE_NAMES.SALES}" in ${renamed.length} organization(s).`,
  );

  for (const role of ROLES_TO_BACKFILL) {
    const createdResult: unknown = await AppDataSource.query(
      `
      INSERT INTO roles (id, organization_id, name, description, is_system, created_at, updated_at)
      SELECT gen_random_uuid(), o.id, $1::text, $2::text, false, NOW(), NOW()
      FROM organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM roles r WHERE r.organization_id = o.id AND r.name = $1::text
      )
      RETURNING id
      `,
      [role.name, role.description],
    );
    const created = returnedRows<{ id: string }>(createdResult);
    console.log(`Created role "${role.name}" in ${created.length} organization(s).`);
  }
}

async function run(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await upsertPermissions();
    console.log(`Upserted ${PERMISSION_SEEDS.length} permissions from catalogue.`);

    await migrateStaffRoles();

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
