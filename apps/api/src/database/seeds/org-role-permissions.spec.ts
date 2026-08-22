import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  CASHIER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  SALES_PERMISSION_KEYS,
  SYSTEM_ADMIN_PERMISSION_KEYS,
  WAREHOUSE_PERMISSION_KEYS,
} from './org-role-permissions';

const OTHER_ISSUE_KEY = 'inventory.goods-issue.other-issue';
const OTHER_RECEIPT_KEY = 'goods_receipt.other-receipt';
const DISPOSAL_KEY = 'inventory.goods-issue.disposal';

describe('goods-issue purpose permission seeds', () => {
  const seededKeys = PERMISSION_SEEDS.map((p) => p.key);

  it('registers every purpose permission key in the catalogue', () => {
    expect(seededKeys).toContain(OTHER_ISSUE_KEY);
    expect(seededKeys).toContain(OTHER_RECEIPT_KEY);
    expect(seededKeys).toContain(DISPOSAL_KEY);
  });

  /**
   * "Nhập khác" / "Xuất khác" / "Hủy hàng" move stock with no purchase, sale or
   * transfer behind them, so no counterparty document can be reconciled against
   * them — they write off value on the branch's own say-so. All three are
   * reserved for the two org-wide roles.
   */
  const RESERVED_PURPOSE_KEYS = [
    OTHER_ISSUE_KEY,
    OTHER_RECEIPT_KEY,
    DISPOSAL_KEY,
  ];

  it.each([
    ['SYSTEM_ADMIN', SYSTEM_ADMIN_PERMISSION_KEYS],
    ['GENERAL_MANAGER', GENERAL_MANAGER_PERMISSION_KEYS],
  ])('grants every reserved purpose key to %s', (_role, keys) => {
    for (const key of RESERVED_PURPOSE_KEYS) expect(keys).toContain(key);
  });

  it.each([
    ['BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
    ['WAREHOUSE', WAREHOUSE_PERMISSION_KEYS],
    ['SALES', SALES_PERMISSION_KEYS],
    ['CASHIER', CASHIER_PERMISSION_KEYS],
  ])('withholds every reserved purpose key from %s', (_role, keys) => {
    for (const key of RESERVED_PURPOSE_KEYS) expect(keys).not.toContain(key);
  });

  /**
   * Điều chuyển is what is left: the warehouse still moves stock between
   * branches, and that leg always has the receiving branch's phiếu nhập on the
   * other side.
   */
  it('leaves the transfer keys with WAREHOUSE', () => {
    expect(WAREHOUSE_PERMISSION_KEYS).toContain('inventory.goods-issue.create');
    expect(WAREHOUSE_PERMISSION_KEYS).toContain('inventory.transfer.export');
  });
});

/**
 * The point of splitting the single "Nhân viên" role: warehouse staff own the
 * stock documents, sales/cashier own selling, and approving stays with managers.
 */
describe('staff roles separate warehouse, selling and cash duties', () => {
  const WAREHOUSE_DOCUMENT_KEYS = [
    'goods_receipt.read',
    'goods_receipt.write',
    'goods_receipt.post',
    'inventory.goods-issue.read',
    'inventory.goods-issue.create',
    'inventory.goods-issue.post',
    'inventory.transfer.create',
    'inventory.transfer.post',
    'inventory.adjustment.create',
    'inventory.adjustment.post',
  ];

  it.each(WAREHOUSE_DOCUMENT_KEYS)('grants %s to WAREHOUSE', (key) => {
    expect(WAREHOUSE_PERMISSION_KEYS).toContain(key);
  });

  it.each(WAREHOUSE_DOCUMENT_KEYS)('withholds %s from SALES and CASHIER', (key) => {
    expect(SALES_PERMISSION_KEYS).not.toContain(key);
    expect(CASHIER_PERMISSION_KEYS).not.toContain(key);
  });

  it('gives the cash drawer to CASHIER only', () => {
    for (const key of [
      'accounting.cash_receipt.create',
      'accounting.cash_payment.create',
      'accounting.cash_count.create',
      'accounting.cash_ledger.read',
    ]) {
      expect(CASHIER_PERMISSION_KEYS).toContain(key);
      expect(SALES_PERMISSION_KEYS).not.toContain(key);
      expect(WAREHOUSE_PERMISSION_KEYS).not.toContain(key);
    }
  });

  it('lets SALES and CASHIER sell, WAREHOUSE not', () => {
    for (const key of ['pos.sale.create', 'pos.invoice.write']) {
      expect(SALES_PERMISSION_KEYS).toContain(key);
      expect(CASHIER_PERMISSION_KEYS).toContain(key);
      expect(WAREHOUSE_PERMISSION_KEYS).not.toContain(key);
    }
  });

  it.each([
    ['SALES', SALES_PERMISSION_KEYS],
    ['CASHIER', CASHIER_PERMISSION_KEYS],
    ['WAREHOUSE', WAREHOUSE_PERMISSION_KEYS],
  ])('never lets %s approve a document', (_role, keys) => {
    expect(keys.filter((key) => key.endsWith('.approve'))).toEqual([]);
  });

  it('keeps chuyển kho tạm (POS fast transfer) for SALES and WAREHOUSE', () => {
    for (const keys of [SALES_PERMISSION_KEYS, WAREHOUSE_PERMISSION_KEYS]) {
      expect(keys).toContain('inventory.temp-warehouse.write');
      expect(keys).toContain('inventory.temp-warehouse.close');
    }
  });

  /**
   * The POS product picker (`GET /pos/branches/:id/catalog*`) feeds both
   * checkout and chuyển kho tạm, so it is gated on inventory.read — every role
   * that may run a temp transfer must be able to search goods.
   */
  it('lets every temp-transfer role search the POS catalogue', () => {
    for (const keys of [SALES_PERMISSION_KEYS, WAREHOUSE_PERMISSION_KEYS]) {
      expect(keys).toContain('inventory.read');
    }
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
    expect(SALES_PERMISSION_KEYS).not.toContain(key);
    expect(CASHIER_PERMISSION_KEYS).not.toContain(key);
    expect(WAREHOUSE_PERMISSION_KEYS).not.toContain(key);
  });

  it('keeps pos.invoice.write for SALES/CASHIER — cancelling is now a separate key', () => {
    expect(SALES_PERMISSION_KEYS).toContain('pos.invoice.write');
    expect(CASHIER_PERMISSION_KEYS).toContain('pos.invoice.write');
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
    ['SALES', SALES_PERMISSION_KEYS, 'BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
    ['CASHIER', CASHIER_PERMISSION_KEYS, 'BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
    [
      'WAREHOUSE',
      WAREHOUSE_PERMISSION_KEYS,
      'BRANCH_MANAGER',
      BRANCH_MANAGER_PERMISSION_KEYS,
    ],
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
    ['xem trước khuyến mại tại Checkout', 'pos.promotion.evaluate'],
  ];

  it.each(POS_STAFF_KEYS)('grants %s (%s) to SALES and CASHIER', (_surface, key) => {
    expect(SALES_PERMISSION_KEYS).toContain(key);
    expect(CASHIER_PERMISSION_KEYS).toContain(key);
  });

  it('registers pos.promotion.evaluate in the permission catalogue', () => {
    expect(PERMISSION_SEEDS.map((p) => p.key)).toContain('pos.promotion.evaluate');
  });

  // The whole point of the narrow key: a cashier prices a cart without being
  // able to read the back-office promotion catalogue. Asserted against both
  // POS roles since STAFF was split into SALES + CASHIER.
  it.each([
    ['SALES', SALES_PERMISSION_KEYS],
    ['CASHIER', CASHIER_PERMISSION_KEYS],
  ])('does not grant the back-office promotion keys to %s', (_role, keys) => {
    expect(keys).not.toContain('promotion.read');
    expect(keys).not.toContain('promotion.write');
  });
});
