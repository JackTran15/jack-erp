import { reportPermissionsOfDomain } from '@erp/shared-interfaces';
import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  CASHIER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  PARTNER_ORDER_PERMISSION_KEYS,
  PARTNER_PERMISSION_KEYS,
  SALES_PERMISSION_KEYS,
  SEED_ROLE_NAMES,
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
      'accounting.bank_receipt.create',
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
    // `pos.sales-order.approve` is the one deliberate exception: a mobile sales
    // order is a consultant's request TO the cashier, and "approve" there means
    // "take it to the till" — not the manager sign-off that every other
    // `.approve` key guards. Granted by migration 1789960000000 to whoever holds
    // `accounting.cash_receipt.create`; the CASHIER list mirrors that.
    expect(
      keys.filter((key) => key.endsWith('.approve') && key !== 'pos.sales-order.approve'),
    ).toEqual([]);
  });

  it('lets CASHIER, and only CASHIER among staff, approve or reject mobile sales orders', () => {
    for (const key of ['pos.sales-order.approve', 'pos.sales-order.reject']) {
      expect(CASHIER_PERMISSION_KEYS).toContain(key);
      expect(SALES_PERMISSION_KEYS).not.toContain(key);
      expect(WAREHOUSE_PERMISSION_KEYS).not.toContain(key);
    }
    // Sending and cancelling one's own order is selling — both selling roles have it.
    for (const key of ['pos.sales-order.read', 'pos.sales-order.create', 'pos.sales-order.cancel']) {
      expect(SALES_PERMISSION_KEYS).toContain(key);
      expect(CASHIER_PERMISSION_KEYS).toContain(key);
    }
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

const PARTNER_KEY = 'partner.catalog.read';

// The partner surface only closes the purchase-price leak if the partner role
// is strictly narrower than inventory.read — see ADR-02. These assertions are
// the machine-checkable half of that argument; the e2e in T-05-02 is the other.
describe('partner catalog permission seeds', () => {
  const seededKeys = PERMISSION_SEEDS.map((p) => p.key);

  it('registers the partner permission in the catalogue', () => {
    expect(seededKeys).toContain(PARTNER_KEY);
  });

  it('files it under its own module, not under inventory', () => {
    const seed = PERMISSION_SEEDS.find((p) => p.key === PARTNER_KEY);
    expect(seed?.module).toBe('partner-catalog');
  });

  it('names a dedicated partner role', () => {
    expect(SEED_ROLE_NAMES.PARTNER).toBe('Đối tác');
  });

  it('gives the partner role exactly one permission', () => {
    expect(PARTNER_PERMISSION_KEYS).toEqual([PARTNER_KEY]);
  });

  it('never gives the partner role an internal inventory key', () => {
    // These two are the endpoints that return purchasePrice.
    expect(PARTNER_PERMISSION_KEYS).not.toContain('inventory.read');
    expect(PARTNER_PERMISSION_KEYS.some((k) => k.startsWith('inventory.'))).toBe(
      false,
    );
  });

  it('keeps the partner key away from every staff role', () => {
    expect(SALES_PERMISSION_KEYS).not.toContain(PARTNER_KEY);
    expect(CASHIER_PERMISSION_KEYS).not.toContain(PARTNER_KEY);
    expect(WAREHOUSE_PERMISSION_KEYS).not.toContain(PARTNER_KEY);
    expect(BRANCH_MANAGER_PERMISSION_KEYS).not.toContain(PARTNER_KEY);
  });

  it('still reaches the two full-access roles through ALL_PERMISSION_KEYS', () => {
    expect(SYSTEM_ADMIN_PERMISSION_KEYS).toContain(PARTNER_KEY);
    expect(GENERAL_MANAGER_PERMISSION_KEYS).toContain(PARTNER_KEY);
  });
});

const PARTNER_ORDER_KEY = 'partner.order.create';

// Measured on a live API before this block existed: POST /v2/partner/orders
// answered 403 "Missing required permission: partner.order.create" to EVERY api
// key, because the permission was seeded but no role granted it. The role split
// below is deliberate (A-25) — a key issued only to place orders must not also
// read the catalogue, which exposes the price list.
describe('partner order permission seeds', () => {
  const seededKeys = PERMISSION_SEEDS.map((p) => p.key);

  it('registers the partner order permission in the catalogue', () => {
    expect(seededKeys).toContain(PARTNER_ORDER_KEY);
  });

  it('names a role of its own, separate from the catalog role', () => {
    expect(SEED_ROLE_NAMES.PARTNER_ORDER).toBe('Đối tác đặt hàng');
    expect(SEED_ROLE_NAMES.PARTNER_ORDER).not.toBe(SEED_ROLE_NAMES.PARTNER);
  });

  it('gives that role exactly one permission', () => {
    expect(PARTNER_ORDER_PERMISSION_KEYS).toEqual([PARTNER_ORDER_KEY]);
  });

  // The whole reason for two roles: placing orders must not imply reading
  // prices, and reading prices must not imply placing orders.
  it('keeps the two partner roles disjoint', () => {
    expect(PARTNER_ORDER_PERMISSION_KEYS).not.toContain(PARTNER_KEY);
    expect(PARTNER_PERMISSION_KEYS).not.toContain(PARTNER_ORDER_KEY);
    expect(PARTNER_PERMISSION_KEYS).toEqual([PARTNER_KEY]);
  });

  it('keeps the order key away from every staff role', () => {
    expect(SALES_PERMISSION_KEYS).not.toContain(PARTNER_ORDER_KEY);
    expect(CASHIER_PERMISSION_KEYS).not.toContain(PARTNER_ORDER_KEY);
    expect(WAREHOUSE_PERMISSION_KEYS).not.toContain(PARTNER_ORDER_KEY);
    expect(BRANCH_MANAGER_PERMISSION_KEYS).not.toContain(PARTNER_ORDER_KEY);
  });
});

const DISPATCH_KEY = 'pos.sales-order.dispatch';
const READ_ALL_KEY = 'pos.sales-order.read-all';

/**
 * The T-01-03 failure, repeated one feature later would be inexcusable:
 * `partner.order.create` was seeded, wired into a guard, and granted by no role,
 * so the endpoint answered 403 to every caller and only a live API call found
 * it. These two keys are the dispatch feature's entry point; if nothing holds
 * them, the whole UoW is dead on arrival.
 *
 * They reach SYSTEM_ADMIN and GENERAL_MANAGER through ALL_PERMISSION_KEYS — that
 * is the grant, and it is deliberate that it stops there (A-08: điều phối is an
 * ORG-level act). The withholding assertions below are AC-13's seed-level half;
 * the 403 on a live call is the other.
 */
describe('web order dispatch permission seeds', () => {
  const seededKeys = PERMISSION_SEEDS.map((p) => p.key);

  it.each([DISPATCH_KEY, READ_ALL_KEY])('registers %s in the catalogue', (key) => {
    expect(seededKeys).toContain(key);
  });

  it.each([DISPATCH_KEY, READ_ALL_KEY])('files %s under the pos module', (key) => {
    expect(PERMISSION_SEEDS.find((p) => p.key === key)?.module).toBe('pos');
  });

  it.each([DISPATCH_KEY, READ_ALL_KEY])('grants %s to the two org-wide roles', (key) => {
    expect(SYSTEM_ADMIN_PERMISSION_KEYS).toContain(key);
    expect(GENERAL_MANAGER_PERMISSION_KEYS).toContain(key);
  });

  // The `pos.` prefix in the BRANCH_MANAGER filter would sweep both keys in by
  // default; ROOT_AND_GENERAL_MANAGER_ONLY_KEYS is what stops it. This is the
  // test that fails if someone removes them from that set.
  it.each([DISPATCH_KEY, READ_ALL_KEY])('withholds %s from every branch-level role', (key) => {
    expect(BRANCH_MANAGER_PERMISSION_KEYS).not.toContain(key);
    expect(CASHIER_PERMISSION_KEYS).not.toContain(key);
    expect(SALES_PERMISSION_KEYS).not.toContain(key);
    expect(WAREHOUSE_PERMISSION_KEYS).not.toContain(key);
  });

  // A-08: reusing `approve` would let every branch cashier dispatch, and the
  // cashier keeps `approve` — so the two keys must not travel together.
  it('keeps dispatch separate from the cashier approve key', () => {
    expect(CASHIER_PERMISSION_KEYS).toContain('pos.sales-order.approve');
    expect(CASHIER_PERMISSION_KEYS).not.toContain(DISPATCH_KEY);
  });
});

/**
 * Every permission in the catalogue must be reachable by somebody.
 *
 * The literal form of that sentence is worthless here, and the 403 above proves
 * it: SYSTEM_ADMIN is DERIVED from PERMISSION_SEEDS (it is every key) and
 * GENERAL_MANAGER is every key bar registration, so "granted by at least one
 * role" was already true of `partner.order.create` on the day no API key could
 * use it. The first test below therefore only guards the derivation itself.
 *
 * The check with teeth is the second one: a permission must appear in one of
 * the HAND-WRITTEN role lists — the roles a non-owner can actually be given —
 * or be named in OWNER_ONLY_KEYS as deliberately withheld. A permission added
 * to the catalogue and wired into a guard, but into no role, then fails here
 * instead of failing in production with a 403.
 */
describe('permission catalogue coverage', () => {
  const seededKeys = PERMISSION_SEEDS.map((p) => p.key);

  /** Role lists written by hand, i.e. not derived from PERMISSION_SEEDS. */
  const CURATED_ROLE_KEYS: ReadonlySet<string> = new Set([
    ...BRANCH_MANAGER_PERMISSION_KEYS,
    ...SALES_PERMISSION_KEYS,
    ...CASHIER_PERMISSION_KEYS,
    ...WAREHOUSE_PERMISSION_KEYS,
    ...PARTNER_PERMISSION_KEYS,
    ...PARTNER_ORDER_PERMISSION_KEYS,
  ]);

  /**
   * Withheld from every role below General Manager ON PURPOSE. Each group has a
   * reason already argued elsewhere in this file or in org-role-permissions.ts;
   * this list is the place where "no role holds it" is a decision rather than an
   * oversight. Adding a key here should feel like signing something.
   */
  const OWNER_ONLY_KEYS: ReadonlySet<string> = new Set([
    // Retiring a branch — a branch manager runs a branch, they do not close one.
    'branch.archive',
    'branch.delete',
    // Stock in or out with no counterparty document to reconcile against.
    'goods_receipt.other-receipt',
    'inventory.goods-issue.other-issue',
    'inventory.goods-issue.disposal',
    // Reversing money that has already been posted.
    'pos.invoice.cancel',
    'accounting.cash_receipt.delete',
    'accounting.cash_payment.delete',
    'accounting.bank_receipt.delete',
    'accounting.bank_payment.delete',
    'accounting.cash_voucher_category.delete',
    // Điều phối đơn web: handing an order to any branch in the chain, and the
    // chain-wide order grid. Argued at the declaration site in
    // org-role-permissions.ts and asserted in "web order dispatch permission
    // seeds" below.
    'pos.sales-order.dispatch',
    'pos.sales-order.read-all',
    // Every store's revenue/profit/debt in one report.
    'reporting.dashboard.consolidated.read',
    'reporting.invoice.consolidated.read',
    'reporting.profit.consolidated.read',
    'reporting.debts.consolidated.read',
    'reporting.cash.consolidated.read',
    // Back-office promotion catalogue: POS prices a cart with
    // pos.promotion.evaluate instead.
    'promotion.read',
    'promotion.write',
    'promotion.delete',
    // Onboarding an organization or a branch.
    'org.registration.submit',
    'org.registration.approve',
    'branch.registration.submit',
    'branch.registration.approve',
    // Platform surfaces: the generic CRUD admin and the dead-letter queue.
    'admin.crud.manage',
    'events.dead-letter.manage',
    'crud.entity.read',
    'crud.entity.create',
    'crud.entity.update',
    'crud.entity.delete',
    // Issuing and revoking API keys — the credentials behind the partner roles.
    'api-key.read',
    'api-key.create',
    'api-key.update',
    'api-key.delete',
    // Editing the permission model itself, and seeing/deleting users chain-wide.
    'iam.user.read.all',
    'iam.user.delete',
    'iam.user.branches.write.all',
    'iam.role.write',
    'iam.role.delete',
    'iam.role.permissions.write',
  ]);

  it('grants every seeded permission to at least one role', () => {
    const granted = new Set([
      ...SYSTEM_ADMIN_PERMISSION_KEYS,
      ...GENERAL_MANAGER_PERMISSION_KEYS,
      ...CURATED_ROLE_KEYS,
    ]);
    expect(seededKeys.filter((key) => !granted.has(key))).toEqual([]);
  });

  it('leaves no seeded permission out of every hand-written role by accident', () => {
    const unreachable = seededKeys.filter(
      (key) => !CURATED_ROLE_KEYS.has(key) && !OWNER_ONLY_KEYS.has(key),
    );
    expect(unreachable).toEqual([]);
  });

  // Keeps the allowlist from rotting: a key granted to a normal role later must
  // not keep pretending to be owner-only, and a deleted permission must not
  // linger here.
  it('keeps OWNER_ONLY_KEYS honest', () => {
    const grantedAnyway = [...OWNER_ONLY_KEYS].filter((key) =>
      CURATED_ROLE_KEYS.has(key),
    );
    expect(grantedAnyway).toEqual([]);
    const notSeeded = [...OWNER_ONLY_KEYS].filter(
      (key) => !seededKeys.includes(key),
    );
    expect(notSeeded).toEqual([]);
  });
});

describe('cash-fund report grants', () => {
  // The cash-fund reports follow the debts floor (migration 1790040000000):
  // managers see them, the operational roles do not — a cashier records cash
  // through the drawer, they do not reconcile the fund.
  it('grants the group and every cash-fund report to the manager roles', () => {
    for (const keys of [
      SYSTEM_ADMIN_PERMISSION_KEYS,
      GENERAL_MANAGER_PERMISSION_KEYS,
      BRANCH_MANAGER_PERMISSION_KEYS,
    ]) {
      expect(keys).toContain('reporting.cash.read');
      for (const key of reportPermissionsOfDomain('cash')) expect(keys).toContain(key);
    }
  });

  it('keeps the chain-wide cash key off BRANCH_MANAGER', () => {
    expect(BRANCH_MANAGER_PERMISSION_KEYS).not.toContain('reporting.cash.consolidated.read');
  });

  it('withholds the cash-fund reports from WAREHOUSE, SALES and CASHIER', () => {
    for (const keys of [WAREHOUSE_PERMISSION_KEYS, SALES_PERMISSION_KEYS, CASHIER_PERMISSION_KEYS]) {
      expect(keys).not.toContain('reporting.cash.read');
      for (const key of reportPermissionsOfDomain('cash')) expect(keys).not.toContain(key);
    }
  });
});
