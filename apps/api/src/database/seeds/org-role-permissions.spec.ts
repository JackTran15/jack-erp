import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  STAFF_PERMISSION_KEYS,
  SYSTEM_ADMIN_PERMISSION_KEYS,
} from './org-role-permissions';

const OTHER_ISSUE_KEY = 'inventory.goods-issue.other-issue';
const DISPOSAL_KEY = 'inventory.goods-issue.disposal';

describe('goods-issue purpose permission seeds', () => {
  const seededKeys = PERMISSION_SEEDS.map((p) => p.key);

  it('registers both purpose permission keys in the catalogue', () => {
    expect(seededKeys).toContain(OTHER_ISSUE_KEY);
    expect(seededKeys).toContain(DISPOSAL_KEY);
  });

  it.each([
    ['SYSTEM_ADMIN', SYSTEM_ADMIN_PERMISSION_KEYS],
    ['GENERAL_MANAGER', GENERAL_MANAGER_PERMISSION_KEYS],
    ['BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
  ])('grants both purpose keys to %s', (_role, keys) => {
    expect(keys).toContain(OTHER_ISSUE_KEY);
    expect(keys).toContain(DISPOSAL_KEY);
  });

  it('does not grant the purpose keys to STAFF', () => {
    expect(STAFF_PERMISSION_KEYS).not.toContain(OTHER_ISSUE_KEY);
    expect(STAFF_PERMISSION_KEYS).not.toContain(DISPOSAL_KEY);
  });
});

describe('reversing money is reserved for User Root & General Manager', () => {
  const RESERVED_KEYS = [
    'accounting.cash_receipt.delete',
    'accounting.cash_payment.delete',
    'accounting.bank_receipt.delete',
    'accounting.bank_payment.delete',
    'accounting.cash_voucher_category.delete',
    'pos.invoice.cancel',
  ];

  it.each(RESERVED_KEYS)('grants %s to SYSTEM_ADMIN and GENERAL_MANAGER only', (key) => {
    expect(SYSTEM_ADMIN_PERMISSION_KEYS).toContain(key);
    expect(GENERAL_MANAGER_PERMISSION_KEYS).toContain(key);
    expect(BRANCH_MANAGER_PERMISSION_KEYS).not.toContain(key);
    expect(STAFF_PERMISSION_KEYS).not.toContain(key);
  });

  it('keeps pos.invoice.write for STAFF — cancelling is now a separate key', () => {
    expect(STAFF_PERMISSION_KEYS).toContain('pos.invoice.write');
  });
});

describe('branch manager reporting scope', () => {
  it('sees branch-level reports', () => {
    for (const key of [
      'reporting.dashboard.branch.read',
      'reporting.invoice.branch.read',
      'reporting.profit.read',
      'reporting.debts.read',
    ]) {
      expect(BRANCH_MANAGER_PERMISSION_KEYS).toContain(key);
    }
  });

  it('does not see chain-wide (consolidated) reports', () => {
    for (const key of [
      'reporting.dashboard.consolidated.read',
      'reporting.invoice.consolidated.read',
    ]) {
      expect(BRANCH_MANAGER_PERMISSION_KEYS).not.toContain(key);
    }
  });
});

describe('branch manager IAM scope', () => {
  it.each([
    ['tạo/sửa nhân viên', 'iam.user.write'],
    ['ma trận quyền khi xem vai trò', 'iam.permission.read'],
    ['danh sách vai trò gán được', 'iam.role.read'],
  ])('grants %s (%s)', (_surface, key) => {
    expect(BRANCH_MANAGER_PERMISSION_KEYS).toContain(key);
  });

  it.each([
    'iam.user.delete',
    'iam.role.write',
    'iam.role.delete',
    'iam.role.permissions.write',
  ])('does not grant %s', (key) => {
    expect(BRANCH_MANAGER_PERMISSION_KEYS).not.toContain(key);
  });
});

describe('retiring a branch is reserved for User Root & General Manager', () => {
  it.each(['branch.archive', 'branch.delete'])('withholds %s from BRANCH_MANAGER', (key) => {
    expect(SYSTEM_ADMIN_PERMISSION_KEYS).toContain(key);
    expect(GENERAL_MANAGER_PERMISSION_KEYS).toContain(key);
    expect(BRANCH_MANAGER_PERMISSION_KEYS).not.toContain(key);
  });

  it('keeps branch.read and branch.write for BRANCH_MANAGER', () => {
    expect(BRANCH_MANAGER_PERMISSION_KEYS).toContain('branch.read');
    expect(BRANCH_MANAGER_PERMISSION_KEYS).toContain('branch.write');
  });
});

/**
 * UsersService.assertCanGrantRoles refuses to grant a role holding permissions
 * the actor lacks. These nesting invariants are what let each seeded role staff
 * the tier below it.
 */
describe('seeded roles nest, so role granting stays possible', () => {
  it.each([
    ['STAFF', STAFF_PERMISSION_KEYS, 'BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
    [
      'BRANCH_MANAGER',
      BRANCH_MANAGER_PERMISSION_KEYS,
      'GENERAL_MANAGER',
      GENERAL_MANAGER_PERMISSION_KEYS,
    ],
    [
      'GENERAL_MANAGER',
      GENERAL_MANAGER_PERMISSION_KEYS,
      'SYSTEM_ADMIN',
      SYSTEM_ADMIN_PERMISSION_KEYS,
    ],
  ])('%s keys are a subset of %s keys', (_lower, lowerKeys, _upper, upperKeys) => {
    const upper = new Set(upperKeys);
    expect(lowerKeys.filter((key) => !upper.has(key))).toEqual([]);
  });

  it('does not let GENERAL_MANAGER grant SYSTEM_ADMIN', () => {
    const gm = new Set(GENERAL_MANAGER_PERMISSION_KEYS);
    expect(SYSTEM_ADMIN_PERMISSION_KEYS.some((key) => !gm.has(key))).toBe(true);
  });

  it('does not let BRANCH_MANAGER grant GENERAL_MANAGER', () => {
    const bm = new Set(BRANCH_MANAGER_PERMISSION_KEYS);
    expect(GENERAL_MANAGER_PERMISSION_KEYS.some((key) => !bm.has(key))).toBe(true);
  });
});

describe('POS staff permission seeds', () => {
  // Keys the pos-web app needs beyond the pos.*/inventory.*/customer.* core.
  const POS_STAFF_KEYS: Array<[string, string]> = [
    ['Báo cáo theo ngày', 'reporting.invoice.branch.read'],
    ['picker NVBH (Checkout, Fast stock transfer)', 'sales-hierarchy.read'],
  ];

  it.each(POS_STAFF_KEYS)('grants %s (%s) to STAFF', (_surface, key) => {
    expect(STAFF_PERMISSION_KEYS).toContain(key);
  });
});
