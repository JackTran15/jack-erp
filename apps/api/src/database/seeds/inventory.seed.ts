/**
 * Dev bootstrap: organization, admin user, role with all permissions, main branch,
 * storages, locations, sample items, and stock balances.
 *
 * Credentials (sign in at backoffice /login):
 *   Email:            inventory.admin@erp.local
 *   Password:         DEV_ADMIN_PLAIN_PASSWORD (constant below; bcrypt-hashed before insert)
 *   Organization ID:  10000000-0000-4000-8000-000000000001
 *
 * Run: pnpm --filter @erp/api seed:inventory   (alias: seed:dev-admin)
 *
 * Note: `ON CONFLICT DO NOTHING` skips existing rows. To apply a new password after changing
 * DEV_ADMIN_PLAIN_PASSWORD, delete the seed user row or run an UPDATE on password_hash.
 */
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';

/** Plaintext dev login password — must match what you type in the backoffice login form. */
const DEV_ADMIN_PLAIN_PASSWORD = 'password123';

const BCRYPT_ROUNDS = 10;

const IDS = {
  organization: '10000000-0000-4000-8000-000000000001',
  branch: '20000000-0000-4000-8000-000000000001',
  user: '30000000-0000-4000-8000-000000000001',
  role: '40000000-0000-4000-8000-000000000001',
  storageMain: '50000000-0000-4000-8000-000000000001',
  storageReserve: '50000000-0000-4000-8000-000000000002',
  locationMain: '60000000-0000-4000-8000-000000000001',
  locationReserve: '60000000-0000-4000-8000-000000000002',
  providerDefault: '65000000-0000-4000-8000-000000000001',
  itemLaptop: '70000000-0000-4000-8000-000000000001',
  itemMonitor: '70000000-0000-4000-8000-000000000002',
  stockLaptopMain: '80000000-0000-4000-8000-000000000001',
  stockLaptopReserve: '80000000-0000-4000-8000-000000000002',
  stockMonitorMain: '80000000-0000-4000-8000-000000000003',
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

    await AppDataSource.query(
      `
      INSERT INTO roles (id, organization_id, name, description, is_system, created_at, updated_at)
      VALUES ($1, $2, 'inventory-admin', 'Inventory management seed role', true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.role, IDS.organization],
    );

    await AppDataSource.query(
      `
      INSERT INTO user_roles (id, user_id, role_id, organization_id, assigned_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW())
      ON CONFLICT (user_id, role_id, organization_id) DO NOTHING
      `,
      [IDS.user, IDS.role, IDS.organization],
    );

    for (const permission of PERMISSION_SEEDS) {
      await AppDataSource.query(
        `
        INSERT INTO permissions (id, key, description, module)
        VALUES (gen_random_uuid(), $1, $2, $3)
        ON CONFLICT (key) DO NOTHING
        `,
        [permission.key, permission.description, permission.module],
      );

      await AppDataSource.query(
        `
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT gen_random_uuid(), $1, p.id
        FROM permissions p
        WHERE p.key = $2
        ON CONFLICT (role_id, permission_id) DO NOTHING
        `,
        [IDS.role, permission.key],
      );
    }

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
      INSERT INTO storages (id, organization_id, branch_id, name, is_main_storage, created_by, created_at, updated_at)
      VALUES
        ($1, $2, $3, 'Main Warehouse', true, $4, NOW(), NOW()),
        ($5, $2, $3, 'Reserve Warehouse', false, $4, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.storageMain,
        IDS.organization,
        IDS.branch,
        IDS.user,
        IDS.storageReserve,
      ],
    );

    await AppDataSource.query(
      `
      INSERT INTO locations (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, 'A-01', 'Main Rack A1', 'RACK', true, $5, NOW(), NOW()),
        ($6, $2, $3, $7, 'B-01', 'Reserve Rack B1', 'RACK', true, $5, NOW(), NOW())
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

    await AppDataSource.query(
      `
      INSERT INTO items (id, organization_id, branch_id, code, name, description, unit, category, is_active, provider_id, created_by, created_at, updated_at)
      VALUES
        ($1, $2, NULL, 'LAPTOP-15', 'Laptop 15 inch', 'Standard demo laptop', 'pcs', 'Hardware', true, $5, $3, NOW(), NOW()),
        ($4, $2, NULL, 'MONITOR-24', 'Monitor 24 inch', 'Standard demo monitor', 'pcs', 'Hardware', true, $5, $3, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [IDS.itemLaptop, IDS.organization, IDS.user, IDS.itemMonitor, IDS.providerDefault],
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

    // 6 variant items: Size(39,40,43) × Color(Nâu,Đen)
    await AppDataSource.query(
      `
      INSERT INTO items (id, organization_id, branch_id, code, name, unit, category, is_active, provider_id, product_id, variant_label, purchase_price, selling_price, created_by, created_at, updated_at)
      VALUES
        ($1,  $7, NULL, 'GELLI-39-NAU', 'Giày Gelli (39 · Nâu)', 'đôi', 'Giày dép', true, $8, $9, '39 · Nâu', 350000, 590000, $10, NOW(), NOW()),
        ($2,  $7, NULL, 'GELLI-39-DEN', 'Giày Gelli (39 · Đen)', 'đôi', 'Giày dép', true, $8, $9, '39 · Đen', 350000, 590000, $10, NOW(), NOW()),
        ($3,  $7, NULL, 'GELLI-40-NAU', 'Giày Gelli (40 · Nâu)', 'đôi', 'Giày dép', true, $8, $9, '40 · Nâu', 350000, 590000, $10, NOW(), NOW()),
        ($4,  $7, NULL, 'GELLI-40-DEN', 'Giày Gelli (40 · Đen)', 'đôi', 'Giày dép', true, $8, $9, '40 · Đen', 350000, 590000, $10, NOW(), NOW()),
        ($5,  $7, NULL, 'GELLI-43-NAU', 'Giày Gelli (43 · Nâu)', 'đôi', 'Giày dép', true, $8, $9, '43 · Nâu', 350000, 590000, $10, NOW(), NOW()),
        ($6,  $7, NULL, 'GELLI-43-DEN', 'Giày Gelli (43 · Đen)', 'đôi', 'Giày dép', true, $8, $9, '43 · Đen', 350000, 590000, $10, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      `,
      [
        IDS.itemShoe39Nau, IDS.itemShoe39Den,
        IDS.itemShoe40Nau, IDS.itemShoe40Den,
        IDS.itemShoe43Nau, IDS.itemShoe43Den,
        IDS.organization, IDS.providerDefault, IDS.productShoe, IDS.user,
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
    console.log('Inventory seed completed successfully (includes product catalog).');
  } finally {
    await AppDataSource.destroy();
  }
}

seedInventoryData().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Inventory seed failed:', error);
  process.exitCode = 1;
});
