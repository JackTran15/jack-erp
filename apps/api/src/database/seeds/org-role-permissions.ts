import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';

/** Seeded role display names (unique per organization). */
export const SEED_ROLE_NAMES = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  GENERAL_MANAGER: 'Quản lý tổng',
  BRANCH_MANAGER: 'Quản lý chi nhánh',
  STAFF: 'Nhân viên',
} as const;

const ALL_PERMISSION_KEYS = PERMISSION_SEEDS.map((p) => p.key);

/** User Root — full access (Party B / platform operator in product spec). */
export const SYSTEM_ADMIN_PERMISSION_KEYS: string[] = [...ALL_PERMISSION_KEYS];

/** General Manager — full tenant operations + consolidated & branch reporting. */
export const GENERAL_MANAGER_PERMISSION_KEYS: string[] = ALL_PERMISSION_KEYS.filter(
  (key) =>
    !key.startsWith('org.registration.') &&
    !key.startsWith('branch.registration.'),
);

/** Branch Manager — branch-scoped operations + branch dashboard. */
export const BRANCH_MANAGER_PERMISSION_KEYS: string[] = ALL_PERMISSION_KEYS.filter(
  (key) =>
    key.startsWith('branch.') ||
    key.startsWith('customer.') ||
    key.startsWith('inventory.') ||
    key.startsWith('product.') ||
    key.startsWith('pos.') ||
    key.startsWith('goods_receipt.') ||
    key.startsWith('accounting.') ||
    key.startsWith('reporting.dashboard.branch.') ||
    key.startsWith('reporting.invoice.branch.') ||
    key === 'reporting.invoice-template.manage' ||
    key === 'iam.user.read' ||
    key === 'iam.user.roles.write' ||
    key === 'iam.user.branches.write' ||
    key === 'sales-hierarchy.read' ||
    key === 'document-numbering.manage',
);

/** Staff — orders, temp warehouse, invoices, shifts, transfer requests. */
export const STAFF_PERMISSION_KEYS: string[] = [
  'customer.read',
  'customer.write',
  'product.read',
  'inventory.read',
  'inventory.item.read',
  'inventory.storage.read',
  'inventory.location.read',
  'inventory.temp-warehouse.read',
  'inventory.temp-warehouse.write',
  'inventory.temp-warehouse.close',
  'inventory.transfer.read',
  'inventory.transfer.create',
  'inventory.transfer.export',
  'inventory.transfer.import',
  'pos.sale.create',
  'pos.invoice.read',
  'pos.invoice.write',
  'pos.return.create',
  'pos.session.manage',
];
