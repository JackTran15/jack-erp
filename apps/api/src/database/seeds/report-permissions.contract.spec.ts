import {
  INVENTORY_VALUE_PERMISSION,
  PERMISSION_LABELS_VI,
  PERMISSION_SHORT_LABELS_VI,
  REPORT_DOMAIN_PERMISSIONS,
  REPORT_PERMISSION_KEYS,
  permissionResourceLabelVi,
  reportPermissionsOfDomain,
  resolvePermissionResource,
} from '@erp/shared-interfaces';
import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  CASHIER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  SALES_PERMISSION_KEYS,
  SYSTEM_ADMIN_PERMISSION_KEYS,
  WAREHOUSE_PERMISSION_KEYS,
} from './org-role-permissions';

const seededKeys = PERMISSION_SEEDS.map((p) => p.key);
const reportPermissions = Object.values(REPORT_PERMISSION_KEYS);
const CONSOLIDATED_KEYS = [
  REPORT_DOMAIN_PERMISSIONS.sales.consolidated,
  REPORT_DOMAIN_PERMISSIONS.profit.consolidated,
  REPORT_DOMAIN_PERMISSIONS.debts.consolidated,
  'reporting.dashboard.consolidated.read',
];

/**
 * Adding a report used to mean touching three files that nothing tied together;
 * miss one and the key exists but renders as a raw string, or the role editor
 * files it under "Khác". These assertions are the tie.
 */
describe('report permission catalogue', () => {
  const ALL = [...reportPermissions, ...CONSOLIDATED_KEYS, INVENTORY_VALUE_PERMISSION];

  it.each(ALL)('%s is in the seeded catalogue', (key) => {
    expect(seededKeys).toContain(key);
  });

  it.each(ALL)('%s has a full Vietnamese label', (key) => {
    expect(PERMISSION_LABELS_VI[key]).toBeTruthy();
    expect(PERMISSION_LABELS_VI[key]).not.toBe(key);
  });

  it.each(reportPermissions)('%s has a short checkbox label', (key) => {
    expect(PERMISSION_SHORT_LABELS_VI[key]).toBeTruthy();
  });

  it.each(ALL)('%s resolves to a named card, not a raw prefix', (key) => {
    const { resourceId } = resolvePermissionResource(key);
    expect(permissionResourceLabelVi(resourceId)).not.toBe(resourceId);
  });

  it('files every report key under the reporting module', () => {
    const byKey = new Map(PERMISSION_SEEDS.map((p) => [p.key, p.module]));
    for (const key of ALL) expect(byKey.get(key)).toBe('reporting');
  });

  it('has no duplicate keys', () => {
    expect(new Set(seededKeys).size).toBe(seededKeys.length);
  });

  it('covers all 22 reports', () => {
    expect(reportPermissions).toHaveLength(22);
    expect(reportPermissionsOfDomain('sales')).toHaveLength(4);
    expect(reportPermissionsOfDomain('profit')).toHaveLength(3);
    expect(reportPermissionsOfDomain('debts')).toHaveLength(4);
    expect(reportPermissionsOfDomain('inventory')).toHaveLength(11);
  });

  it('keeps the value permission out of the per-report set', () => {
    // Otherwise `reportPermissionsOfDomain('inventory')` would hand it to the
    // warehouse role along with the eleven reports.
    expect(reportPermissions).not.toContain(INVENTORY_VALUE_PERMISSION);
    expect(reportPermissionsOfDomain('inventory')).not.toContain(
      INVENTORY_VALUE_PERMISSION,
    );
  });
});

describe('report permission role seeds', () => {
  it.each([
    ['SYSTEM_ADMIN', SYSTEM_ADMIN_PERMISSION_KEYS],
    ['GENERAL_MANAGER', GENERAL_MANAGER_PERMISSION_KEYS],
    ['BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
  ])('grants every report to %s', (_role, keys) => {
    for (const key of reportPermissions) expect(keys).toContain(key);
  });

  /**
   * The product rule: "các cửa hàng không xem được báo cáo bán hàng, kết quả
   * kinh doanh, lợi nhuận của nhau — trừ quản lý hệ thống". A branch manager
   * holding a consolidated key would lift the branch clamp in
   * `resolveReportBranchIds` and see the whole chain's money.
   */
  it.each([
    ['BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
    ['SALES', SALES_PERMISSION_KEYS],
    ['CASHIER', CASHIER_PERMISSION_KEYS],
    ['WAREHOUSE', WAREHOUSE_PERMISSION_KEYS],
  ])('does not grant any consolidated key to %s', (_role, keys) => {
    for (const key of CONSOLIDATED_KEYS) expect(keys).not.toContain(key);
  });

  it.each([
    ['SYSTEM_ADMIN', SYSTEM_ADMIN_PERMISSION_KEYS],
    ['GENERAL_MANAGER', GENERAL_MANAGER_PERMISSION_KEYS],
  ])('does grant the consolidated keys to %s', (_role, keys) => {
    for (const key of CONSOLIDATED_KEYS) expect(keys).toContain(key);
  });

  it('gives WAREHOUSE every stock report including the value columns', () => {
    // Chủ sản phẩm chốt 2026-09-07: nhân viên kho đối chiếu giá trị nhập/xuất
    // ngay trên báo cáo, nên giữ cột giá trị. Quyền vẫn tồn tại và vẫn enforce —
    // nó dành cho vai trò tự tạo, không phải để chặn vai trò kho.
    for (const key of reportPermissionsOfDomain('inventory')) {
      expect(WAREHOUSE_PERMISSION_KEYS).toContain(key);
    }
    expect(WAREHOUSE_PERMISSION_KEYS).toContain(INVENTORY_VALUE_PERMISSION);
  });

  it.each([
    ['BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
    ['WAREHOUSE', WAREHOUSE_PERMISSION_KEYS],
  ])('gives %s the value columns it has today', (_role, keys) => {
    expect(keys).toContain(INVENTORY_VALUE_PERMISSION);
  });

  it.each([
    ['SALES', SALES_PERMISSION_KEYS],
    ['CASHIER', CASHIER_PERMISSION_KEYS],
  ])('gives %s only the one sales report pos-web runs', (_role, keys) => {
    const granted = reportPermissionsOfDomain('sales').filter((k) =>
      keys.includes(k),
    );
    expect(granted).toEqual([REPORT_PERMISSION_KEYS['revenue-by-item']]);
  });

  it.each([
    ['SALES', SALES_PERMISSION_KEYS],
    ['CASHIER', CASHIER_PERMISSION_KEYS],
  ])('does not give %s any profit or debt report', (_role, keys) => {
    for (const key of [
      ...reportPermissionsOfDomain('profit'),
      ...reportPermissionsOfDomain('debts'),
    ]) {
      expect(keys).not.toContain(key);
    }
  });
});
