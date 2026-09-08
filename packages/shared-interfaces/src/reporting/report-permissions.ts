/**
 * Which permission each report needs, in one place.
 *
 * Every report of a domain shares the same routes (`POST /reports/inventory/search`
 * with `reportType` in the body, `GET columns?reportType=`), so a route-level
 * `@RequirePermission` cannot express "one permission per report" — the key has to
 * be resolved from the report key at request time. `ReportPermissionGuard` reads
 * this map, the backoffice dropdown filters against it, and the role seed grants
 * from it, so the strings live here and are never copied.
 *
 * The last segment is the backend report key verbatim (minus the redundant
 * `inventory-` prefix in the inventory domain), which keeps the mapping mechanical
 * and reviewable.
 */

/** A report domain: one backend registry, one screen, one menu entry. */
export type ReportDomain = 'sales' | 'inventory' | 'debts' | 'profit';

/**
 * Per-domain permissions that are not about a single report.
 *
 * `floor` is the right to open the screen at all — it gates the endpoints that
 * carry no `reportType` (`filter-options`, listing/updating saved templates) and
 * the nav entry. These are the four coarse keys that used to gate everything;
 * they keep their names so no existing role loses access.
 *
 * `consolidated` widens a money report from the actor's assigned branches to the
 * whole organization. Inventory has none: its reports are organization-wide by
 * design (quantities only — the money columns are gated by
 * `INVENTORY_VALUE_PERMISSION` instead).
 */
export const REPORT_DOMAIN_PERMISSIONS: {
  sales: { floor: string; consolidated: string };
  profit: { floor: string; consolidated: string };
  debts: { floor: string; consolidated: string };
  inventory: { floor: string };
} = {
  sales: {
    floor: 'reporting.invoice.branch.read',
    consolidated: 'reporting.invoice.consolidated.read',
  },
  profit: {
    floor: 'reporting.profit.read',
    consolidated: 'reporting.profit.consolidated.read',
  },
  debts: {
    floor: 'reporting.debts.read',
    consolidated: 'reporting.debts.consolidated.read',
  },
  inventory: {
    floor: 'inventory.reports.read',
  },
};

/**
 * Seeing the money columns of an inventory report (`openingValue`, `inValue`,
 * `outValue`, `endingValue`, …).
 *
 * Split from the report permissions because stock reports are organization-wide:
 * a store may look up another store's quantities, but its cost and inventory
 * value are a separate grant.
 */
export const INVENTORY_VALUE_PERMISSION = 'reporting.inventory.value.read';

/** Backend report key → the permission required to run that report. */
export const REPORT_PERMISSION_KEYS: Record<string, string> = {
  // Bán hàng
  'daily-sales-summary': 'reporting.sales.daily-sales-summary.read',
  'invoice-order-listing': 'reporting.sales.invoice-order-listing.read',
  'invoice-item-revenue-detail':
    'reporting.sales.invoice-item-revenue-detail.read',
  'revenue-by-item': 'reporting.sales.revenue-by-item.read',

  // Lợi nhuận
  'profit-by-item': 'reporting.profit.profit-by-item.read',
  'gross-profit-by-invoice': 'reporting.profit.gross-profit-by-invoice.read',
  'business-results': 'reporting.profit.business-results.read',

  // Công nợ
  'customer-debts': 'reporting.debts.customer-debts.read',
  'receivables-detail-by-product':
    'reporting.debts.receivables-detail-by-product.read',
  'supplier-debts': 'reporting.debts.supplier-debts.read',
  'supplier-debts-detail-by-document-and-product':
    'reporting.debts.supplier-debts-detail-by-document-and-product.read',

  // Kho
  'inventory-stock-summary': 'reporting.inventory.stock-summary.read',
  'inventory-document-detail': 'reporting.inventory.document-detail.read',
  'inventory-stock-quantity-detail':
    'reporting.inventory.stock-quantity-detail.read',
  'inventory-stock-summary-by-store':
    'reporting.inventory.stock-summary-by-store.read',
  'inventory-stock-by-store-pivot':
    'reporting.inventory.stock-by-store-pivot.read',
  'inventory-transfer-summary': 'reporting.inventory.transfer-summary.read',
  'inventory-transfer-summary-by-counterpart':
    'reporting.inventory.transfer-summary-by-counterpart.read',
  'inventory-transfer-document-detail':
    'reporting.inventory.transfer-document-detail.read',
  'inventory-transfer-difference-detail':
    'reporting.inventory.transfer-difference-detail.read',
  'inventory-transfer-by-store': 'reporting.inventory.transfer-by-store.read',
  'inventory-temp-warehouse-out':
    'reporting.inventory.temp-warehouse-out.read',
};

/** Every report permission of one domain — what the nav and the seed grant in bulk. */
export function reportPermissionsOfDomain(domain: ReportDomain): string[] {
  const prefix =
    domain === 'sales'
      ? 'reporting.sales.'
      : domain === 'profit'
        ? 'reporting.profit.'
        : domain === 'debts'
          ? 'reporting.debts.'
          : 'reporting.inventory.';
  return Object.values(REPORT_PERMISSION_KEYS).filter((key) =>
    key.startsWith(prefix),
  );
}
