/**
 * Dev bootstrap: organization, admin user, role with all permissions, main branch,
 * storages, locations, sample items, and stock balances.
 *
 * Credentials (sign in at backoffice /login):
 *   Organization ID:  10000000-0000-4000-8000-000000000001
 *   Password:         DEV_ADMIN_PLAIN_PASSWORD (constant below; bcrypt-hashed before insert)
 *
 *   Email:            inventory.admin@erp.local
 *   Role:             Quản trị hệ thống (system, full access — read-only on UI)
 *
 *   Other seeded roles (CRUD on UI): Quản lý tổng, Quản lý chi nhánh, Nhân viên
 *
 * Run: pnpm --filter @erp/api seed:inventory   (alias: seed:dev-admin)
 *
 * Note: `ON CONFLICT DO NOTHING` skips existing rows. To apply a new password after changing
 * DEV_ADMIN_PLAIN_PASSWORD, delete the seed user row or run an UPDATE on password_hash.
 */
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  SEED_ROLE_NAMES,
  STAFF_PERMISSION_KEYS,
  SYSTEM_ADMIN_PERMISSION_KEYS,
} from './org-role-permissions';

/** Plaintext dev login password — must match what you type in the backoffice login form. */
const DEV_ADMIN_PLAIN_PASSWORD = 'password123';

const BCRYPT_ROUNDS = 10;

const IDS = {
  organization: '10000000-0000-4000-8000-000000000001',
  branch: '20000000-0000-4000-8000-000000000001',
  user: '30000000-0000-4000-8000-000000000001',
  roleSystemAdmin: '40000000-0000-4000-8000-000000000001',
  roleGeneralManager: '40000000-0000-4000-8000-000000000003',
  roleBranchManager: '40000000-0000-4000-8000-000000000004',
  roleStaff: '40000000-0000-4000-8000-000000000005',
  /** Legacy second admin role from earlier seeds — removed after merge. */
  legacyAdminRole: '40000000-0000-4000-8000-000000000002',
  storageMain: '50000000-0000-4000-8000-000000000001',
  storageReserve: '50000000-0000-4000-8000-000000000002',
  storageShowroom: '50000000-0000-4000-8000-000000000003',
  locationMain: '60000000-0000-4000-8000-000000000001',
  locationReserve: '60000000-0000-4000-8000-000000000002',
  locationShowroom: '60000000-0000-4000-8000-000000000003',
  showroomMain: '55000000-0000-4000-8000-000000000001',
  providerDefault: '65000000-0000-4000-8000-000000000001',
  itemLaptop: '70000000-0000-4000-8000-000000000001',
  itemMonitor: '70000000-0000-4000-8000-000000000002',
  stockLaptopMain: '80000000-0000-4000-8000-000000000001',
  stockLaptopReserve: '80000000-0000-4000-8000-000000000002',
  stockMonitorMain: '80000000-0000-4000-8000-000000000003',
  // Chart of Accounts
  accountCash: 'B0000000-0000-4000-8000-000000000001',
  accountBank: 'B0000000-0000-4000-8000-000000000002',
  accountRevenue: 'B0000000-0000-4000-8000-000000000003',
  accountReceivable: 'B0000000-0000-4000-8000-000000000004',
  // Payment-account & default-account config (resolved server-side at checkout)
  defaultAccountRevenue:    'E0000000-0000-4000-8000-000000000001',
  defaultAccountReceivable: 'E0000000-0000-4000-8000-000000000002',
  paymentAccountCash:       'E0000000-0000-4000-8000-000000000003',
  paymentAccountBank:       'E0000000-0000-4000-8000-000000000004',
  paymentAccountCard:       'E0000000-0000-4000-8000-000000000005',
  // POS / Customer
  cashAccountRegister: 'C0000000-0000-4000-8000-000000000001',
  customerWalkIn:    'D0000000-0000-4000-8000-000000000001',
  customerNguyenAn:  'D0000000-0000-4000-8000-000000000002',
  customerTranBinh:  'D0000000-0000-4000-8000-000000000003',
  customerLeChi:     'D0000000-0000-4000-8000-000000000004',
  customerPhamDung:  'D0000000-0000-4000-8000-000000000005',
  customerHoangMai:  'D0000000-0000-4000-8000-000000000006',
  // Product catalog (EPIC-006)
  productShoe: 'A0000000-0000-4000-8000-000000000001',
  attrDefSize: 'A1000000-0000-4000-8000-000000000001',
  attrDefColor: 'A1000000-0000-4000-8000-000000000002',
  optSize39: 'A2000000-0000-4000-8000-000000000001',
  optSize40: 'A2000000-0000-4000-8000-000000000002',
  optSize43: 'A2000000-0000-4000-8000-000000000003',
  optColorNau: 'A2000000-0000-4000-8000-000000000004',
  optColorDen: 'A2000000-0000-4000-8000-000000000005',
  itemShoe39Nau: 'A3000000-0000-4000-8000-000000000001',
  itemShoe39Den: 'A3000000-0000-4000-8000-000000000002',
  itemShoe40Nau: 'A3000000-0000-4000-8000-000000000003',
  itemShoe40Den: 'A3000000-0000-4000-8000-000000000004',
  itemShoe43Nau: 'A3000000-0000-4000-8000-000000000005',
  itemShoe43Den: 'A3000000-0000-4000-8000-000000000006',
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
): Promise<void> {
  await upsertPermissions();
  await AppDataSource.query(
    `DELETE FROM role_permissions WHERE role_id = $1`,
    [roleId],
  );
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

async function seedInventoryData() {
  await AppDataSource.initialize();

  const devAdminPasswordHash = bcrypt.hashSync(
    DEV_ADMIN_PLAIN_PASSWORD,
    BCRYPT_ROUNDS,
  );

  try {
    await AppDataSource.query(
      `
      INSERT INTO organizations (id, organization_id, branch_id, name, contact_email, status, created_by, created_at, updated_at)
      VALUES ($1::uuid, $2, NULL, 'Inventory Demo Org', 'inventory.demo@erp.local', 'ACTIVE', $3, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.organization, IDS.organization, IDS.user],
    );

    await AppDataSource.query(
      `
      INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
      VALUES ($1, $2, 'inventory.admin@erp.local', $3, 'Inventory', 'Admin', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.user, IDS.organization, devAdminPasswordHash],
    );

    // Rename legacy `admin` role id to Quản trị hệ thống (system, immutable on UI).
    await AppDataSource.query(
      `
      UPDATE roles
      SET name = 'admin-legacy-' || substr(replace(id::text, '-', ''), 1, 8),
          updated_at = NOW()
      WHERE organization_id = $1
        AND name IN ('admin', $2)
        AND id <> $3::uuid
      `,
      [
        IDS.organization,
        SEED_ROLE_NAMES.SYSTEM_ADMIN,
        IDS.roleSystemAdmin,
      ],
    );

    await upsertSeedRole(
      IDS.roleSystemAdmin,
      IDS.organization,
      SEED_ROLE_NAMES.SYSTEM_ADMIN,
      'User Root — toàn quyền hệ thống (không chỉnh trên UI)',
      true,
    );
    await assignPermissionsToRole(
      IDS.roleSystemAdmin,
      SYSTEM_ADMIN_PERMISSION_KEYS,
    );

    await upsertSeedRole(
      IDS.roleGeneralManager,
      IDS.organization,
      SEED_ROLE_NAMES.GENERAL_MANAGER,
      'Toàn quyền vận hành + báo cáo tổng hợp và từng chi nhánh',
      false,
    );
    await assignPermissionsToRole(
      IDS.roleGeneralManager,
      GENERAL_MANAGER_PERMISSION_KEYS,
    );

    await upsertSeedRole(
      IDS.roleBranchManager,
      IDS.organization,
      SEED_ROLE_NAMES.BRANCH_MANAGER,
      'Toàn quyền vận hành trong phạm vi chi nhánh + báo cáo chi nhánh',
      false,
    );
    await assignPermissionsToRole(
      IDS.roleBranchManager,
      BRANCH_MANAGER_PERMISSION_KEYS,
    );

    await upsertSeedRole(
      IDS.roleStaff,
      IDS.organization,
      SEED_ROLE_NAMES.STAFF,
      'Đơn hàng, kho tạm, hóa đơn, ca làm việc, yêu cầu điều chuyển',
      false,
    );
    await assignPermissionsToRole(IDS.roleStaff, STAFF_PERMISSION_KEYS);

    await AppDataSource.query(
      `
      INSERT INTO user_roles (id, user_id, role_id, organization_id, assigned_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW())
      ON CONFLICT (user_id, role_id, organization_id) DO NOTHING
      `,
      [IDS.user, IDS.roleSystemAdmin, IDS.organization],
    );

    // Drop duplicate dev admin user / legacy admin role from earlier seeds.
    await AppDataSource.query(
      `
      DELETE FROM user_branch_assignments
      WHERE user_id IN (
        SELECT id FROM users
        WHERE organization_id = $1 AND email = 'admin@erp.local'
      )
      `,
      [IDS.organization],
    );
    await AppDataSource.query(
      `
      DELETE FROM user_roles
      WHERE user_id IN (
        SELECT id FROM users
        WHERE organization_id = $1 AND email = 'admin@erp.local'
      )
      `,
      [IDS.organization],
    );
    await AppDataSource.query(
      `
      DELETE FROM users
      WHERE organization_id = $1 AND email = 'admin@erp.local'
      `,
      [IDS.organization],
    );
    await AppDataSource.query(
      `
      DELETE FROM role_permissions WHERE role_id = $1
      `,
      [IDS.legacyAdminRole],
    );
    await AppDataSource.query(
      `
      DELETE FROM user_roles WHERE role_id = $1
      `,
      [IDS.legacyAdminRole],
    );
    await AppDataSource.query(
      `
      DELETE FROM roles
      WHERE id = $1 AND organization_id = $2
      `,
      [IDS.legacyAdminRole, IDS.organization],
    );

    await AppDataSource.query(
      `
      INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
      VALUES ($1, $2, 'Main Branch', 'ACTIVE', true, $3, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.branch, IDS.organization, IDS.user],
    );

    await AppDataSource.query(
      `
      UPDATE organizations
      SET main_branch_id = $1
      WHERE id = $2
      `,
      [IDS.branch, IDS.organization],
    );

    await AppDataSource.query(
      `
      INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by, assigned_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $1, NOW())
      ON CONFLICT (user_id, branch_id) DO NOTHING
      `,
      [IDS.user, IDS.branch, IDS.organization],
    );

    await AppDataSource.query(
      `
      INSERT INTO accounts (id, organization_id, branch_id, code, name, type, is_active, created_by, created_at, updated_at)
      VALUES
        ($1, $5, NULL, '1111', 'Tiền mặt',            'ASSET',   true, $5, NOW(), NOW()),
        ($2, $5, NULL, '1121', 'Tiền gửi ngân hàng',  'ASSET',   true, $5, NOW(), NOW()),
        ($3, $5, NULL, '5111', 'Doanh thu bán hàng',  'REVENUE', true, $5, NOW(), NOW()),
        ($4, $5, NULL, '1311', 'Phải thu khách hàng', 'ASSET',   true, $5, NOW(), NOW())
      ON CONFLICT (organization_id, code) DO NOTHING
      `,
      [IDS.accountCash, IDS.accountBank, IDS.accountRevenue, IDS.accountReceivable, IDS.organization],
    );

    // Cash account (REGISTER) tied to the main branch + 1111 ledger account
    await AppDataSource.query(
      `
      INSERT INTO cash_accounts (id, organization_id, branch_id, name, type, balance, account_id, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, 'Main Register', 'REGISTER', 0, $4, $5, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.cashAccountRegister, IDS.organization, IDS.branch, IDS.accountCash, IDS.user],
    );

    // Default COA accounts resolved server-side at checkout (org-wide, branch_id NULL).
    await AppDataSource.query(
      `
      INSERT INTO accounting_default_account
        (id, organization_id, branch_id, account_role, account_id, created_by, created_at, updated_at)
      VALUES
        ($1, $5, NULL, 'REVENUE',    $3, $6, NOW(), NOW()),
        ($2, $5, NULL, 'RECEIVABLE', $4, $6, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.defaultAccountRevenue,
        IDS.defaultAccountReceivable,
        IDS.accountRevenue,
        IDS.accountReceivable,
        IDS.organization,
        IDS.user,
      ],
    );

    // Payment method → receiving COA account, branch-scoped.
    await AppDataSource.query(
      `
      INSERT INTO payment_accounts
        (id, organization_id, branch_id, payment_method, account_id, label, is_active, sort_order, created_by, created_at, updated_at)
      VALUES
        ($1, $7, $8, 'cash',          $4, 'Tiền mặt',     true, 0, $9, NOW(), NOW()),
        ($2, $7, $8, 'bank_transfer', $5, 'Chuyển khoản', true, 0, $9, NOW(), NOW()),
        ($3, $7, $8, 'card',          $6, 'Quẹt thẻ',     true, 0, $9, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.paymentAccountCash,
        IDS.paymentAccountBank,
        IDS.paymentAccountCard,
        IDS.accountCash,
        IDS.accountBank,
        IDS.accountBank,
        IDS.organization,
        IDS.branch,
        IDS.user,
      ],
    );

    // Customers — walk-in (debt scenarios) + a few sample retail/B2B records.
    // Phone/email columns are unique-per-org so values must not collide across rows.
    await AppDataSource.query(
      `
      INSERT INTO customers (
        id, organization_id, branch_id, code, name, email, phone, address,
        status, gender, company_name, tax_code, note,
        created_by, created_at, updated_at
      )
      VALUES
        ($1, $7, NULL, 'KH000001', 'Walk-in Customer',
         NULL, NULL, NULL,
         'ACTIVE', 'unspecified', NULL, NULL, 'Default anonymous walk-in',
         $8, NOW(), NOW()),

        ($2, $7, NULL, 'KH000002', 'Nguyễn Văn An',
         'an.nguyen@example.com', '0901000002', '12 Lê Lợi, Q.1, TP.HCM',
         'ACTIVE', 'male', NULL, NULL, 'Khách lẻ thân thiết',
         $8, NOW(), NOW()),

        ($3, $7, NULL, 'KH000003', 'Trần Thị Bình',
         'binh.tran@example.com', '0901000003', '45 Nguyễn Huệ, Q.1, TP.HCM',
         'ACTIVE', 'female', NULL, NULL, NULL,
         $8, NOW(), NOW()),

        ($4, $7, NULL, 'KH000004', 'Lê Quang Chi',
         'chi.le@example.com',  '0901000004', '88 Trần Hưng Đạo, Q.5, TP.HCM',
         'ACTIVE', 'male', NULL, NULL, NULL,
         $8, NOW(), NOW()),

        ($5, $7, NULL, 'KH000005', 'Phạm Văn Dũng',
         'dung.pham@example.com', '0901000005', '17 Cách Mạng Tháng 8, Q.3, TP.HCM',
         'ACTIVE', 'male',
         'Công ty TNHH Dũng Phát', '0312345678', 'Khách B2B — thanh toán công nợ 30 ngày',
         $8, NOW(), NOW()),

        ($6, $7, NULL, 'KH000006', 'Hoàng Thị Mai',
         'mai.hoang@example.com', '0901000006', '202 Võ Văn Tần, Q.3, TP.HCM',
         'ACTIVE', 'female', NULL, NULL, 'Hội viên hạng bạc',
         $8, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.customerWalkIn,
        IDS.customerNguyenAn,
        IDS.customerTranBinh,
        IDS.customerLeChi,
        IDS.customerPhamDung,
        IDS.customerHoangMai,
        IDS.organization,
        IDS.user,
      ],
    );

    await AppDataSource.query(
      `
      INSERT INTO storages (id, organization_id, branch_id, name, is_main_storage, created_by, created_at, updated_at)
      VALUES
        ($1, $2, $3, 'Main Warehouse', true, $4, NOW(), NOW()),
        ($5, $2, $3, 'Reserve Warehouse', false, $4, NOW(), NOW()),
        ($6, $2, $3, 'Main Showroom Storage', false, $4, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.storageMain,
        IDS.organization,
        IDS.branch,
        IDS.user,
        IDS.storageReserve,
        IDS.storageShowroom,
      ],
    );

    await AppDataSource.query(
      `
      INSERT INTO locations (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, 'A-01', 'Main Rack A1', 'RACK', true, $5, NOW(), NOW()),
        ($6, $2, $3, $7, 'B-01', 'Reserve Rack B1', 'RACK', true, $5, NOW(), NOW()),
        ($8, $2, $3, $9, 'SR-01', 'Main Showroom Floor', 'ZONE', true, $5, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.locationMain,
        IDS.organization,
        IDS.branch,
        IDS.storageMain,
        IDS.user,
        IDS.locationReserve,
        IDS.storageReserve,
        IDS.locationShowroom,
        IDS.storageShowroom,
      ],
    );

    await AppDataSource.query(
      `
      INSERT INTO showrooms (id, organization_id, branch_id, name, storage_id, is_main_showroom, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, 'Main Showroom', $4, true, $5, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.showroomMain,
        IDS.organization,
        IDS.branch,
        IDS.storageShowroom,
        IDS.user,
      ],
    );

    await AppDataSource.query(
      `
      INSERT INTO inventory_providers (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
      VALUES ($1, $2, 'DEFAULT', 'Default Supplier', true, $3, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.providerDefault, IDS.organization, IDS.user],
    );

    // Seed default DISPOSAL reasons for the demo org.
    await AppDataSource.query(
      `
      INSERT INTO issue_reasons (id, organization_id, code, name, purpose, is_active, created_by, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), $1, 'HONG_BAO_QUAN', 'Hàng hỏng do bảo quản chưa tốt', 'DISPOSAL', true, $2, NOW(), NOW()),
        (uuid_generate_v4(), $1, 'HET_HAN', 'Hàng hỏng do hết hạn sử dụng', 'DISPOSAL', true, $2, NOW(), NOW()),
        (uuid_generate_v4(), $1, 'XUAT_MAU', 'Xuất hàng mẫu', 'OTHER', true, $2, NOW(), NOW()),
        (uuid_generate_v4(), $1, 'XUAT_NOI_BO', 'Xuất sử dụng nội bộ', 'OTHER', true, $2, NOW(), NOW())
      ON CONFLICT (organization_id, code) DO NOTHING
      `,
      [IDS.organization, IDS.user],
    );

    // Create "Hardware" category for the two demo items.
    const hardwareCategoryRows: Array<{ id: string }> = await AppDataSource.query(
      `
      INSERT INTO inventory_item_categories (id, organization_id, name, created_by, created_at, updated_at)
      VALUES (uuid_generate_v4(), $1, 'Hardware', $2, NOW(), NOW())
      ON CONFLICT (organization_id, name) DO UPDATE SET updated_at = NOW()
      RETURNING id
      `,
      [IDS.organization, IDS.user],
    );
    const hardwareCategoryId = hardwareCategoryRows[0]!.id;

    await AppDataSource.query(
      `
      INSERT INTO items (id, organization_id, branch_id, code, name, description, unit, category_id, is_active, created_by, created_at, updated_at)
      VALUES
        ($1, $2, NULL, 'LAPTOP-15', 'Laptop 15 inch', 'Standard demo laptop', 'pcs', $5, true, $3, NOW(), NOW()),
        ($4, $2, NULL, 'MONITOR-24', 'Monitor 24 inch', 'Standard demo monitor', 'pcs', $5, true, $3, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.itemLaptop, IDS.organization, IDS.user, IDS.itemMonitor, hardwareCategoryId],
    );

    // Link the default supplier as primary for both demo items.
    await AppDataSource.query(
      `
      INSERT INTO item_providers (organization_id, item_id, provider_id, is_primary, created_by)
      VALUES
        ($1, $2, $3, true, $4),
        ($1, $5, $3, true, $4)
      ON CONFLICT (item_id, provider_id) DO NOTHING
      `,
      [IDS.organization, IDS.itemLaptop, IDS.providerDefault, IDS.user, IDS.itemMonitor],
    );

    await AppDataSource.query(
      `
      INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, last_movement_at, created_by, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, 32, NOW(), $6, NOW(), NOW()),
        ($7, $2, $3, $4, $8, 10, NOW(), $6, NOW(), NOW()),
        ($9, $2, $3, $10, $5, 45, NOW(), $6, NOW(), NOW())
      ON CONFLICT (organization_id, item_id, location_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW(), last_movement_at = NOW()
      `,
      [
        IDS.stockLaptopMain,
        IDS.organization,
        IDS.branch,
        IDS.itemLaptop,
        IDS.locationMain,
        IDS.user,
        IDS.stockLaptopReserve,
        IDS.locationReserve,
        IDS.stockMonitorMain,
        IDS.itemMonitor,
      ],
    );

    // ─── Product catalog (EPIC-006) ────────────────────────────────────────────

    await AppDataSource.query(
      `
      INSERT INTO products (id, organization_id, branch_id, name, description, is_active, default_provider_id, auto_migrated, created_by, created_at, updated_at)
      VALUES ($1, $2, NULL, 'Giày Gelli', 'Giày da thời trang cao cấp', true, $3, false, $4, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.productShoe, IDS.organization, IDS.providerDefault, IDS.user],
    );

    await AppDataSource.query(
      `
      INSERT INTO product_attribute_definitions (id, organization_id, branch_id, product_id, name, sort_order, created_by, created_at, updated_at)
      VALUES
        ($1, $3, NULL, $5, 'Size', 0, $4, NOW(), NOW()),
        ($2, $3, NULL, $5, 'Màu', 1, $4, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.attrDefSize, IDS.attrDefColor, IDS.organization, IDS.user, IDS.productShoe],
    );

    await AppDataSource.query(
      `
      INSERT INTO product_attribute_options (id, organization_id, branch_id, attribute_definition_id, value_label, sort_order, code_suffix, created_by, created_at, updated_at)
      VALUES
        ($1, $6, NULL, $4, '39', 0, '39', $7, NOW(), NOW()),
        ($2, $6, NULL, $4, '40', 1, '40', $7, NOW(), NOW()),
        ($3, $6, NULL, $4, '43', 2, '43', $7, NOW(), NOW()),
        ($8, $6, NULL, $5, 'Nâu', 0, 'NAU', $7, NOW(), NOW()),
        ($9, $6, NULL, $5, 'Đen', 1, 'DEN', $7, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.optSize39, IDS.optSize40, IDS.optSize43,
        IDS.attrDefSize, IDS.attrDefColor,
        IDS.organization, IDS.user,
        IDS.optColorNau, IDS.optColorDen,
      ],
    );

    // "Giày dép" category for shoe variants.
    const shoeCategoryRows: Array<{ id: string }> = await AppDataSource.query(
      `
      INSERT INTO inventory_item_categories (id, organization_id, name, created_by, created_at, updated_at)
      VALUES (uuid_generate_v4(), $1, 'Giày dép', $2, NOW(), NOW())
      ON CONFLICT (organization_id, name) DO UPDATE SET updated_at = NOW()
      RETURNING id
      `,
      [IDS.organization, IDS.user],
    );
    const shoeCategoryId = shoeCategoryRows[0]!.id;

    // 6 variant items: Size(39,40,43) × Color(Nâu,Đen)
    await AppDataSource.query(
      `
      INSERT INTO items (id, organization_id, branch_id, code, name, unit, category_id, is_active, product_id, variant_label, purchase_price, selling_price, created_by, created_at, updated_at)
      VALUES
        ($1,  $7, NULL, 'GELLI-39-NAU', 'Giày Gelli (39 · Nâu)', 'đôi', $8, true, $9, '39 · Nâu', 350000, 590000, $10, NOW(), NOW()),
        ($2,  $7, NULL, 'GELLI-39-DEN', 'Giày Gelli (39 · Đen)', 'đôi', $8, true, $9, '39 · Đen', 350000, 590000, $10, NOW(), NOW()),
        ($3,  $7, NULL, 'GELLI-40-NAU', 'Giày Gelli (40 · Nâu)', 'đôi', $8, true, $9, '40 · Nâu', 350000, 590000, $10, NOW(), NOW()),
        ($4,  $7, NULL, 'GELLI-40-DEN', 'Giày Gelli (40 · Đen)', 'đôi', $8, true, $9, '40 · Đen', 350000, 590000, $10, NOW(), NOW()),
        ($5,  $7, NULL, 'GELLI-43-NAU', 'Giày Gelli (43 · Nâu)', 'đôi', $8, true, $9, '43 · Nâu', 350000, 590000, $10, NOW(), NOW()),
        ($6,  $7, NULL, 'GELLI-43-DEN', 'Giày Gelli (43 · Đen)', 'đôi', $8, true, $9, '43 · Đen', 350000, 590000, $10, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.itemShoe39Nau, IDS.itemShoe39Den,
        IDS.itemShoe40Nau, IDS.itemShoe40Den,
        IDS.itemShoe43Nau, IDS.itemShoe43Den,
        IDS.organization, shoeCategoryId, IDS.productShoe, IDS.user,
      ],
    );

    // Link default supplier as primary for all 6 shoe variants.
    await AppDataSource.query(
      `
      INSERT INTO item_providers (organization_id, item_id, provider_id, is_primary, created_by)
      VALUES
        ($1, $2, $8, true, $9),
        ($1, $3, $8, true, $9),
        ($1, $4, $8, true, $9),
        ($1, $5, $8, true, $9),
        ($1, $6, $8, true, $9),
        ($1, $7, $8, true, $9)
      ON CONFLICT (item_id, provider_id) DO NOTHING
      `,
      [
        IDS.organization,
        IDS.itemShoe39Nau, IDS.itemShoe39Den,
        IDS.itemShoe40Nau, IDS.itemShoe40Den,
        IDS.itemShoe43Nau, IDS.itemShoe43Den,
        IDS.providerDefault, IDS.user,
      ],
    );

    // Junction: item_attribute_values (each variant → 2 rows: one for Size, one for Color)
    // Uses ON CONFLICT on unique (item_id, attribute_definition_id)
    await AppDataSource.query(
      `
      INSERT INTO item_attribute_values (id, organization_id, branch_id, item_id, attribute_definition_id, option_id, created_by, created_at, updated_at)
      VALUES
        (gen_random_uuid(), $13, NULL, $1, $7, $9,  $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $1, $8, $11, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $2, $7, $9,  $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $2, $8, $12, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $3, $7, $10, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $3, $8, $11, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $4, $7, $10, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $4, $8, $12, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $5, $7, $15, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $5, $8, $11, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $6, $7, $15, $14, NOW(), NOW()),
        (gen_random_uuid(), $13, NULL, $6, $8, $12, $14, NOW(), NOW())
      ON CONFLICT (item_id, attribute_definition_id) DO NOTHING
      `,
      [
        IDS.itemShoe39Nau,  // $1
        IDS.itemShoe39Den,  // $2
        IDS.itemShoe40Nau,  // $3
        IDS.itemShoe40Den,  // $4
        IDS.itemShoe43Nau,  // $5
        IDS.itemShoe43Den,  // $6
        IDS.attrDefSize,    // $7
        IDS.attrDefColor,   // $8
        IDS.optSize39,      // $9
        IDS.optSize40,      // $10
        IDS.optColorNau,    // $11
        IDS.optColorDen,    // $12
        IDS.organization,   // $13
        IDS.user,           // $14
        IDS.optSize43,      // $15
      ],
    );

    // Product storage location: Giày Gelli → Main Warehouse → Main Rack A1
    await AppDataSource.query(
      `
      INSERT INTO product_storage_locations (id, organization_id, branch_id, product_id, storage_id, location_id, created_by, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, NULL, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (product_id, storage_id) DO NOTHING
      `,
      [IDS.organization, IDS.productShoe, IDS.storageMain, IDS.locationMain, IDS.user],
    );

    // Stock balances for a few shoe variants (so the matrix view shows data)
    await AppDataSource.query(
      `
      INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, last_movement_at, created_by, created_at, updated_at)
      VALUES
        (gen_random_uuid(), $1, $2, $3, $6, 15, NOW(), $7, NOW(), NOW()),
        (gen_random_uuid(), $1, $2, $4, $6, 8,  NOW(), $7, NOW(), NOW()),
        (gen_random_uuid(), $1, $2, $5, $6, 22, NOW(), $7, NOW(), NOW())
      ON CONFLICT (organization_id, item_id, location_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW(), last_movement_at = NOW()
      `,
      [
        IDS.organization,   // $1
        IDS.branch,         // $2
        IDS.itemShoe39Nau,  // $3
        IDS.itemShoe40Den,  // $4
        IDS.itemShoe43Nau,  // $5
        IDS.locationMain,   // $6
        IDS.user,           // $7
      ],
    );

    // eslint-disable-next-line no-console
    console.log(
      'Inventory seed completed (inventory.admin@erp.local → Quản trị hệ thống + 3 vai trò mẫu).',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

seedInventoryData().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Inventory seed failed:', error);
  process.exitCode = 1;
});
