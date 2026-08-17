import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';

/** Seeded role display names (unique per organization). */
export const SEED_ROLE_NAMES = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  GENERAL_MANAGER: 'Quản lý tổng',
  BRANCH_MANAGER: 'Quản lý chi nhánh',
  SALES: 'Nhân viên bán hàng',
  CASHIER: 'Nhân viên thu ngân',
  WAREHOUSE: 'Nhân viên kho',
} as const;

/** Previous single staff role, renamed to SALES — see sync-admin-permissions.seed.ts. */
export const LEGACY_STAFF_ROLE_NAME = 'Nhân viên';

const ALL_PERMISSION_KEYS = PERMISSION_SEEDS.map((p) => p.key);

/** User Root — full access (Party B / platform operator in product spec). */
export const SYSTEM_ADMIN_PERMISSION_KEYS: string[] = [...ALL_PERMISSION_KEYS];

/** General Manager — full tenant operations + consolidated & branch reporting. */
export const GENERAL_MANAGER_PERMISSION_KEYS: string[] = ALL_PERMISSION_KEYS.filter(
  (key) =>
    !key.startsWith('org.registration.') &&
    !key.startsWith('branch.registration.'),
);

/**
 * Reserved for User Root and General Manager: deleting a voucher (phiếu thu/chi
 * tiền mặt & tiền gửi, and the voucher category itself) and cancelling a paid
 * invoice — both reverse posted money movements.
 */
const ROOT_AND_GENERAL_MANAGER_ONLY_KEYS: ReadonlySet<string> = new Set([
  'accounting.cash_receipt.delete',
  'accounting.cash_payment.delete',
  'accounting.bank_receipt.delete',
  'accounting.bank_payment.delete',
  'accounting.cash_voucher_category.delete',
  'pos.invoice.cancel',
]);

/**
 * Reserved for User Root and General Manager: removing a branch from the chain.
 * A branch manager runs a branch, they do not retire one.
 */
const BRANCH_LIFECYCLE_KEYS: ReadonlySet<string> = new Set([
  'branch.archive',
  'branch.delete',
]);

/** Branch Manager — branch-scoped operations + branch dashboard. */
export const BRANCH_MANAGER_PERMISSION_KEYS: string[] = ALL_PERMISSION_KEYS.filter(
  (key) =>
    !ROOT_AND_GENERAL_MANAGER_ONLY_KEYS.has(key) &&
    !BRANCH_LIFECYCLE_KEYS.has(key) &&
    // Onboarding a branch/organization belongs to General Manager & User Root.
    ((!key.startsWith('branch.registration.') && key.startsWith('branch.')) ||
      key.startsWith('customer.') ||
      key.startsWith('inventory.') ||
      key.startsWith('product.') ||
      key.startsWith('pos.') ||
      key.startsWith('goods_receipt.') ||
      key.startsWith('accounting.') ||
      key.startsWith('reporting.dashboard.branch.') ||
      key.startsWith('reporting.invoice.branch.') ||
      // Branch-pinned by resolveBranchIds() — consolidated needs the key below.
      key === 'reporting.profit.read' ||
      // Aggregated across branches by design (docs/24-debt-reports-spec.md).
      key === 'reporting.debts.read' ||
      key === 'reporting.invoice-template.manage' ||
      key === 'iam.user.read' ||
      // Staffing the branch: create/edit an employee at /admin/employees, and
      // the Chức vụ catalogue (job-position CRUD is gated on the same key).
      key === 'iam.user.write' ||
      key === 'iam.user.roles.write' ||
      key === 'iam.user.branches.write' ||
      // Needed to list assignable roles for iam.user.roles.write above.
      key === 'iam.role.read' ||
      // Renders the permission matrix when viewing a role read-only.
      key === 'iam.permission.read' ||
      // Assign/unassign routes are all @RequireBranchScope().
      key === 'sales-hierarchy.read' ||
      key === 'sales-hierarchy.manage' ||
      // "… cho chi nhánh" — staffing the branch the manager runs.
      key === 'salesman.assign' ||
      key === 'salesmanager.assign' ||
      key === 'storage.manager.assign' ||
      key === 'document-numbering.manage'),
);

/**
 * Sales staff — orders, temp warehouse ("chuyển kho tạm" in POS), invoices, shifts.
 * Warehouse documents (phiếu nhập/xuất/chuyển kho) belong to WAREHOUSE below.
 */
export const SALES_PERMISSION_KEYS: string[] = [
  'customer.read',
  'customer.write',
  'product.read',
  // Shared product/item catalogue — both CRUD configs gate on inventory.read.
  'inventory.read',
  'inventory.item.read',
  // POS "Chuyển kho nhanh" runs entirely on the temp-warehouse endpoints.
  'inventory.temp-warehouse.read',
  'inventory.temp-warehouse.write',
  'inventory.temp-warehouse.close',
  'pos.sale.create',
  'pos.invoice.read',
  'pos.invoice.write',
  'pos.return.create',
  'pos.exchange.create',
  'pos.session.manage',
  'pos.promotion.read',
  // POS Checkout: POST /v2/promotions/evaluate to price the cart before
  // taking payment. Deliberately not `promotion.read`, which would also open
  // the back-office promotion catalogue.
  'pos.promotion.evaluate',
  'accounting.cash.read',
  // POS Báo cáo theo ngày: /reports/pos/daily-summary* + /reports/invoices/*
  'reporting.invoice.branch.read',
  // POS Checkout + Fast stock transfer: GET /branches/:id/salesmen
  'sales-hierarchy.read',
];

/** Cashier — sells like SALES, plus the cash drawer (phiếu thu/chi, kiểm kê, sổ tiền mặt). */
export const CASHIER_PERMISSION_KEYS: string[] = [
  'customer.read',
  'customer.write',
  'product.read',
  'inventory.read',
  'inventory.item.read',
  'pos.sale.create',
  'pos.invoice.read',
  'pos.invoice.write',
  'pos.return.create',
  'pos.exchange.create',
  'pos.session.manage',
  'pos.promotion.read',
  // POS Checkout: POST /v2/promotions/evaluate to price the cart before
  // taking payment. Deliberately not `promotion.read`, which would also open
  // the back-office promotion catalogue.
  'pos.promotion.evaluate',
  'accounting.cash.read',
  'accounting.cash.create',
  'accounting.cash_receipt.create',
  'accounting.cash_receipt.read',
  'accounting.cash_payment.create',
  'accounting.cash_payment.read',
  'accounting.cash_count.create',
  'accounting.cash_count.read',
  'accounting.cash_ledger.read',
  'accounting.cash_voucher_partner.read',
  'accounting.cash_voucher_category.read',
  'reporting.invoice.branch.read',
  'sales-hierarchy.read',
];

/**
 * Warehouse staff — the full stock-document lifecycle (nhập, xuất, chuyển kho,
 * kiểm kê) except approval, which stays with the branch manager.
 */
export const WAREHOUSE_PERMISSION_KEYS: string[] = [
  'product.read',
  'customer.read',
  'inventory.read',
  'inventory.write',
  'inventory.item.read',
  'inventory.storage.read',
  'inventory.storage.write',
  'inventory.location.read',
  'inventory.location.write',
  'inventory.showroom.read',
  // Phiếu nhập kho
  'goods_receipt.read',
  'goods_receipt.write',
  'goods_receipt.post',
  // Phiếu xuất kho
  'inventory.goods-issue.read',
  'inventory.goods-issue.create',
  'inventory.goods-issue.post',
  'inventory.goods-issue.cancel',
  'inventory.goods-issue.other-issue',
  'inventory.goods-issue.disposal',
  // Chuyển kho + lệnh điều chuyển
  'inventory.transfer.read',
  'inventory.transfer.create',
  'inventory.transfer.export',
  'inventory.transfer.import',
  'inventory.transfer.post',
  'inventory.transfer.cancel',
  // Kiểm kê kho (stock-take routes gate on the adjustment keys)
  'inventory.adjustment.read',
  'inventory.adjustment.create',
  'inventory.adjustment.submit',
  'inventory.adjustment.post',
  'inventory.adjustment.cancel',
  // Chuyển kho tạm
  'inventory.temp-warehouse.read',
  'inventory.temp-warehouse.write',
  'inventory.temp-warehouse.close',
  'inventory.purchase-order.read',
  'inventory.purchase-order.create',
  'inventory.purchase-order.receive',
  // Báo cáo kho (gồm "Hàng hoá xuất kho tạm")
  'inventory.reports.read',
  // Báo cáo bán hàng theo mặt hàng
  'reporting.invoice.branch.read',
  'sales-hierarchy.read',
];
