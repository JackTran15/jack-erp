/**
 * Shared org-baseline seeding logic: an organization, an admin user, the six RBAC
 * roles, and the org-wide accounting/customer foundation — and NOTHING branch- or
 * product-scoped. Extracted so it can be driven with either fixed, deterministic IDs
 * (`org-baseline.seed.ts`, one static demo org) or freshly generated IDs
 * (`new-org.seed.ts`, a new org per run).
 */
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { DEFAULT_COA } from '../../modules/accounting/seeders/coa-seeder.service';
import { AccountingDefaultAccountRole } from '../../modules/accounting/payment-accounts/enums';
import { DEFAULT_CASH_VOUCHER_CATEGORIES } from '../../modules/accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.seeder';
import { DEFAULT_MEMBERSHIP_CARD_TYPES } from '../../modules/customer/services/membership-card-type.seeder';
import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  CASHIER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  SALES_PERMISSION_KEYS,
  SEED_ROLE_NAMES,
  SYSTEM_ADMIN_PERMISSION_KEYS,
  WAREHOUSE_PERMISSION_KEYS,
} from './org-role-permissions';

const BCRYPT_ROUNDS = 10;

export interface OrgBaselineSeedIds {
  organization: string;
  user: string;
  roleSystemAdmin: string;
  roleGeneralManager: string;
  roleBranchManager: string;
  roleSales: string;
  roleCashier: string;
  roleWarehouse: string;
  defaultAccount: Record<AccountingDefaultAccountRole, string>;
  paymentAccount: Record<string, string>;
}

export interface OrgBaselineSeedParams {
  ids: OrgBaselineSeedIds;
  organizationName: string;
  adminEmail: string;
  adminPasswordPlain: string;
}

/**
 * Org-default COA account per role, by code. Mirrors
 * `DefaultAccountSeederService.ROLE_TO_CODE` (TT200 codes present in {@link DEFAULT_COA}).
 */
const ROLE_TO_CODE: Record<AccountingDefaultAccountRole, string> = {
  [AccountingDefaultAccountRole.REVENUE]: '511',
  [AccountingDefaultAccountRole.RECEIVABLE]: '131',
  [AccountingDefaultAccountRole.OTHER_INCOME]: '711',
  [AccountingDefaultAccountRole.PAYABLE]: '331',
  [AccountingDefaultAccountRole.EXPENSE]: '642',
};

/** Payment method → receiving COA account (by code), org-wide. */
const PAYMENT_ACCOUNTS = [
  { method: 'cash', code: '1111', label: 'Tiền mặt', sortOrder: 0 },
  { method: 'bank_transfer', code: '112', label: 'Chuyển khoản', sortOrder: 0 },
  { method: 'card', code: '112', label: 'Quẹt thẻ', sortOrder: 0 },
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
): Promise<void> {
  await upsertPermissions();
  await AppDataSource.query(`DELETE FROM role_permissions WHERE role_id = $1`, [
    roleId,
  ]);
  for (const key of permissionKeys) {
    await AppDataSource.query(
      `
      INSERT INTO role_permissions (id, role_id, permission_id)
      SELECT gen_random_uuid(), $1, p.id
      FROM permissions p
      WHERE p.key = $2
      ON CONFLICT (role_id, permission_id) DO NOTHING
      `,
      [roleId, key],
    );
  }
}

async function upsertSeedRole(
  id: string,
  organizationId: string,
  name: string,
  description: string,
  isSystem: boolean,
): Promise<void> {
  // Defensively rename any colliding same-name role so the unique (org, name) holds.
  await AppDataSource.query(
    `
    UPDATE roles
    SET name = 'role-legacy-' || substr(replace(id::text, '-', ''), 1, 8),
        updated_at = NOW()
    WHERE organization_id = $1
      AND name = $2
      AND id <> $3::uuid
    `,
    [organizationId, name, id],
  );

  await AppDataSource.query(
    `
    INSERT INTO roles (id, organization_id, name, description, is_system, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_system = EXCLUDED.is_system,
      updated_at = NOW()
    `,
    [id, organizationId, name, description, isSystem],
  );
}

export async function seedOrgBaselineData(params: OrgBaselineSeedParams): Promise<void> {
  const { ids: IDS, organizationName, adminEmail, adminPasswordPlain } = params;
  const adminPasswordHash = bcrypt.hashSync(adminPasswordPlain, BCRYPT_ROUNDS);

  // ── Organization (org-wide row; created_by points at the admin seeded next) ──
  await AppDataSource.query(
    `
    INSERT INTO organizations (id, organization_id, branch_id, name, contact_email, status, created_by, created_at, updated_at)
    VALUES ($1::uuid, $2, NULL, $3, $4, 'ACTIVE', $5, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [IDS.organization, IDS.organization, organizationName, adminEmail, IDS.user],
  );

  // ── Admin user ──
  await AppDataSource.query(
    `
    INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'Admin', 'User', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [IDS.user, IDS.organization, adminEmail, adminPasswordHash],
  );

  // ── RBAC: 6 seed roles + their permission sets ──
  await upsertSeedRole(
    IDS.roleSystemAdmin,
    IDS.organization,
    SEED_ROLE_NAMES.SYSTEM_ADMIN,
    'User Root — toàn quyền hệ thống (không chỉnh trên UI)',
    true,
  );
  await assignPermissionsToRole(IDS.roleSystemAdmin, SYSTEM_ADMIN_PERMISSION_KEYS);

  await upsertSeedRole(
    IDS.roleGeneralManager,
    IDS.organization,
    SEED_ROLE_NAMES.GENERAL_MANAGER,
    'Toàn quyền vận hành + báo cáo tổng hợp và từng chi nhánh',
    false,
  );
  await assignPermissionsToRole(IDS.roleGeneralManager, GENERAL_MANAGER_PERMISSION_KEYS);

  await upsertSeedRole(
    IDS.roleBranchManager,
    IDS.organization,
    SEED_ROLE_NAMES.BRANCH_MANAGER,
    'Toàn quyền vận hành trong phạm vi chi nhánh + báo cáo chi nhánh',
    false,
  );
  await assignPermissionsToRole(IDS.roleBranchManager, BRANCH_MANAGER_PERMISSION_KEYS);

  await upsertSeedRole(
    IDS.roleSales,
    IDS.organization,
    SEED_ROLE_NAMES.SALES,
    'Đơn hàng, kho tạm, hóa đơn, ca làm việc',
    false,
  );
  await assignPermissionsToRole(IDS.roleSales, SALES_PERMISSION_KEYS);

  await upsertSeedRole(
    IDS.roleCashier,
    IDS.organization,
    SEED_ROLE_NAMES.CASHIER,
    'Bán hàng + quỹ tiền mặt: phiếu thu, phiếu chi, kiểm kê, sổ tiền mặt',
    false,
  );
  await assignPermissionsToRole(IDS.roleCashier, CASHIER_PERMISSION_KEYS);

  await upsertSeedRole(
    IDS.roleWarehouse,
    IDS.organization,
    SEED_ROLE_NAMES.WAREHOUSE,
    'Phiếu nhập, phiếu xuất, chuyển kho, kiểm kê kho, báo cáo kho',
    false,
  );
  await assignPermissionsToRole(IDS.roleWarehouse, WAREHOUSE_PERMISSION_KEYS);

  // ── Assign the admin user the System Admin role ──
  await AppDataSource.query(
    `
    INSERT INTO user_roles (id, user_id, role_id, organization_id, assigned_at)
    VALUES (gen_random_uuid(), $1, $2, $3, NOW())
    ON CONFLICT (user_id, role_id, organization_id) DO NOTHING
    `,
    [IDS.user, IDS.roleSystemAdmin, IDS.organization],
  );

  // ── Chart of Accounts (org-wide, branch_id NULL) ──
  // Insert every account flat (parent_account_id NULL), then wire parent links
  // via a self-join UPDATE — avoids INSERT…SELECT parameter-type ambiguity.
  const coaValues: string[] = [];
  const coaParams: unknown[] = [IDS.organization, IDS.user];
  let cp = coaParams.length;
  for (const a of DEFAULT_COA) {
    coaValues.push(
      `(gen_random_uuid(), $1, NULL, $${cp + 1}, $${cp + 2}, $${cp + 3}::accounts_type_enum, true, $2, NOW(), NOW())`,
    );
    coaParams.push(a.code, a.name, a.type);
    cp += 3;
  }
  await AppDataSource.query(
    `
    INSERT INTO accounts (id, organization_id, branch_id, code, name, type, is_active, created_by, created_at, updated_at)
    VALUES ${coaValues.join(', ')}
    ON CONFLICT (organization_id, code) DO NOTHING
    `,
    coaParams,
  );

  for (const a of DEFAULT_COA.filter((x) => x.parent)) {
    await AppDataSource.query(
      `
      UPDATE accounts c
      SET parent_account_id = p.id
      FROM accounts p
      WHERE c.organization_id = $1 AND p.organization_id = $1
        AND c.code = $2 AND p.code = $3
        AND c.parent_account_id IS NULL
      `,
      [IDS.organization, a.code, a.parent],
    );
  }

  // Resolve COA code → id for the default-account & payment-account config below.
  const accountRows: Array<{ code: string; id: string }> = await AppDataSource.query(
    `SELECT code, id FROM accounts WHERE organization_id = $1`,
    [IDS.organization],
  );
  const accountIdByCode = new Map(accountRows.map((r) => [r.code, r.id]));

  // ── Default COA account per role (org-wide, branch_id NULL) ──
  const daValues: string[] = [];
  const daParams: unknown[] = [IDS.organization, IDS.user];
  let dp = daParams.length;
  for (const [role, code] of Object.entries(ROLE_TO_CODE)) {
    const accountId = accountIdByCode.get(code);
    if (!accountId) continue;
    daValues.push(
      `($${dp + 1}, $1, NULL, $${dp + 2}::accounting_default_account_role_enum, $${dp + 3}, $2, NOW(), NOW())`,
    );
    daParams.push(IDS.defaultAccount[role as AccountingDefaultAccountRole], role, accountId);
    dp += 3;
  }
  if (daValues.length > 0) {
    await AppDataSource.query(
      `
      INSERT INTO accounting_default_account
        (id, organization_id, branch_id, account_role, account_id, created_by, created_at, updated_at)
      VALUES ${daValues.join(', ')}
      ON CONFLICT (id) DO NOTHING
      `,
      daParams,
    );
  }

  // ── Payment method → receiving COA account, org-wide (branch_id NULL) ──
  const paValues: string[] = [];
  const paParams: unknown[] = [IDS.organization, IDS.user];
  let pp = paParams.length;
  for (const pa of PAYMENT_ACCOUNTS) {
    const accountId = accountIdByCode.get(pa.code);
    if (!accountId) continue;
    paValues.push(
      `($${pp + 1}, $1, NULL, $${pp + 2}::payment_account_method_enum, $${pp + 3}, $${pp + 4}, true, $${pp + 5}, $2, NOW(), NOW())`,
    );
    paParams.push(IDS.paymentAccount[pa.method], pa.method, accountId, pa.label, pa.sortOrder);
    pp += 5;
  }
  if (paValues.length > 0) {
    await AppDataSource.query(
      `
      INSERT INTO payment_accounts
        (id, organization_id, branch_id, payment_method, account_id, label, is_active, sort_order, created_by, created_at, updated_at)
      VALUES ${paValues.join(', ')}
      ON CONFLICT (id) DO NOTHING
      `,
      paParams,
    );
  }

  // ── Cash voucher categories (Mục thu / Mục chi), org-wide ──
  const cvcValues: string[] = [];
  const cvcParams: unknown[] = [IDS.organization, IDS.user];
  let vp = cvcParams.length;
  for (const c of DEFAULT_CASH_VOUCHER_CATEGORIES) {
    cvcValues.push(
      `(gen_random_uuid(), $1, $${vp + 1}, $${vp + 2}, $${vp + 3}::cash_voucher_category_direction_enum, $${vp + 4}, true, $2, NOW(), NOW())`,
    );
    cvcParams.push(c.code, c.name, c.direction, c.displayOrder);
    vp += 4;
  }
  await AppDataSource.query(
    `
    INSERT INTO cash_voucher_categories
      (id, organization_id, code, name, direction, display_order, is_active, created_by, created_at, updated_at)
    VALUES ${cvcValues.join(', ')}
    ON CONFLICT (organization_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      display_order = EXCLUDED.display_order
    `,
    cvcParams,
  );

  // ── Membership card types (default tiers), org-wide ──
  const mctValues: string[] = [];
  const mctParams: unknown[] = [IDS.organization, IDS.user];
  let mp = mctParams.length;
  for (const t of DEFAULT_MEMBERSHIP_CARD_TYPES) {
    mctValues.push(
      `(gen_random_uuid(), $1, NULL, NOW(), NOW(), $2, $${mp + 1}, $${mp + 2}::membership_tier_enum, true, $${mp + 3})`,
    );
    mctParams.push(t.name, t.tier, t.sortOrder);
    mp += 3;
  }
  await AppDataSource.query(
    `
    INSERT INTO membership_card_types
      (id, organization_id, branch_id, created_at, updated_at, created_by, name, tier, is_active, sort_order)
    VALUES ${mctValues.join(', ')}
    ON CONFLICT (organization_id, tier) DO NOTHING
    `,
    mctParams,
  );
}
