import { PERMISSION_LABELS_VI } from "@erp/shared-interfaces";

export interface PermissionSeed {
  key: string;
  description: string;
  module: string;
}

type PermissionDefinition = Pick<PermissionSeed, "key" | "module">;

const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Customer
  { key: "customer.read", module: "customer" },
  { key: "customer.write", module: "customer" },
  { key: "customer.merge", module: "customer" },

  // Branch
  { key: "branch.read", module: "branch" },
  { key: "branch.write", module: "branch" },
  { key: "branch.archive", module: "branch" },

  // Inventory
  { key: "inventory.read", module: "inventory" },
  { key: "inventory.write", module: "inventory" },
  { key: "inventory.item.read", module: "inventory" },
  { key: "inventory.item.write", module: "inventory" },
  { key: "inventory.storage.read", module: "inventory" },
  { key: "inventory.storage.write", module: "inventory" },
  { key: "inventory.showroom.read", module: "inventory" },
  { key: "inventory.showroom.write", module: "inventory" },
  { key: "inventory.location.read", module: "inventory" },
  { key: "inventory.location.write", module: "inventory" },
  { key: "inventory.transfer.approve", module: "inventory" },
  { key: "inventory.adjustment.approve", module: "inventory" },
  { key: "inventory.purchase-order.read", module: "inventory" },
  { key: "inventory.purchase-order.create", module: "inventory" },
  { key: "inventory.purchase-order.approve", module: "inventory" },
  { key: "inventory.purchase-order.receive", module: "inventory" },
  { key: "inventory.purchase-order.cancel", module: "inventory" },
  { key: "inventory.goods-issue.read", module: "inventory" },
  { key: "inventory.goods-issue.create", module: "inventory" },
  { key: "inventory.goods-issue.approve", module: "inventory" },
  { key: "inventory.goods-issue.post", module: "inventory" },
  { key: "inventory.goods-issue.cancel", module: "inventory" },
  { key: "inventory.goods-issue.other-issue", module: "inventory" },
  { key: "inventory.goods-issue.disposal", module: "inventory" },
  { key: "goods_receipt.read", module: "inventory" },
  { key: "goods_receipt.write", module: "inventory" },
  { key: "goods_receipt.post", module: "inventory" },
  { key: "inventory.transfer.read", module: "inventory" },
  { key: "inventory.transfer.create", module: "inventory" },
  { key: "inventory.transfer.export", module: "inventory" },
  { key: "inventory.transfer.import", module: "inventory" },
  { key: "inventory.transfer.post", module: "inventory" },
  { key: "inventory.transfer.cancel", module: "inventory" },
  { key: "inventory.adjustment.read", module: "inventory" },
  { key: "inventory.adjustment.create", module: "inventory" },
  { key: "inventory.adjustment.submit", module: "inventory" },
  { key: "inventory.adjustment.post", module: "inventory" },
  { key: "inventory.adjustment.cancel", module: "inventory" },
  { key: "inventory.temp-warehouse.read", module: "inventory" },
  { key: "inventory.temp-warehouse.write", module: "inventory" },
  { key: "inventory.temp-warehouse.close", module: "inventory" },
  { key: "inventory.manage", module: "inventory" },

  // Product
  { key: "product.read", module: "product" },
  { key: "product.write", module: "product" },

  // POS
  { key: "pos.invoice.read", module: "pos" },
  { key: "pos.invoice.write", module: "pos" },
  { key: "pos.sale.create", module: "pos" },
  { key: "pos.return.create", module: "pos" },
  { key: "pos.exchange.create", module: "pos" },
  { key: "pos.session.manage", module: "pos" },
  { key: "pos.session.approve_variance", module: "pos" },
  { key: "pos.promotion.read", module: "pos" },
  { key: "pos.promotion.write", module: "pos" },

  // Accounting
  { key: "accounting.journal.post", module: "accounting" },
  { key: "accounting.journal.reverse", module: "accounting" },
  { key: "accounting.payable.manage", module: "accounting" },
  { key: "accounting.receivable.manage", module: "accounting" },
  { key: "accounting.cash.read", module: "accounting" },
  { key: "accounting.cash.create", module: "accounting" },
  { key: "accounting.expenses.read", module: "accounting" },
  { key: "accounting.expenses.create", module: "accounting" },
  { key: "accounting.expenses.update", module: "accounting" },
  { key: "accounting.payables.read", module: "accounting" },
  { key: "accounting.payables.create", module: "accounting" },
  { key: "accounting.payables.update", module: "accounting" },
  { key: "accounting.receivables.read", module: "accounting" },
  { key: "accounting.receivables.create", module: "accounting" },
  { key: "accounting.receivables.update", module: "accounting" },
  { key: "accounting.receivables.write-off", module: "accounting" },

  // Cash vouchers (Phiếu thu / Phiếu chi / Kiểm kê / Sổ tiền mặt)
  { key: "accounting.cash_receipt.create", module: "accounting" },
  { key: "accounting.cash_receipt.read", module: "accounting" },
  { key: "accounting.cash_receipt.update", module: "accounting" },
  { key: "accounting.cash_receipt.delete", module: "accounting" },
  { key: "accounting.cash_receipt.post", module: "accounting" },
  { key: "accounting.cash_receipt.reverse", module: "accounting" },
  { key: "accounting.cash_payment.create", module: "accounting" },
  { key: "accounting.cash_payment.read", module: "accounting" },
  { key: "accounting.cash_payment.update", module: "accounting" },
  { key: "accounting.cash_payment.delete", module: "accounting" },
  { key: "accounting.cash_payment.post", module: "accounting" },
  { key: "accounting.cash_payment.reverse", module: "accounting" },
  { key: "accounting.cash_count.create", module: "accounting" },
  { key: "accounting.cash_count.read", module: "accounting" },
  { key: "accounting.cash_count.update", module: "accounting" },
  { key: "accounting.cash_count.post", module: "accounting" },
  { key: "accounting.cash_ledger.read", module: "accounting" },
  { key: "accounting.cash_voucher_partner.read", module: "accounting" },
  { key: "accounting.cash_voucher_category.create", module: "accounting" },
  { key: "accounting.cash_voucher_category.read", module: "accounting" },
  { key: "accounting.cash_voucher_category.update", module: "accounting" },
  { key: "accounting.cash_voucher_category.delete", module: "accounting" },

  // Reporting
  { key: "reporting.dashboard.branch.read", module: "reporting" },
  { key: "reporting.dashboard.consolidated.read", module: "reporting" },
  { key: "inventory.reports.read", module: "reporting" },
  { key: "reporting.invoice.branch.read", module: "reporting" },
  { key: "reporting.invoice.consolidated.read", module: "reporting" },
  { key: "reporting.invoice-template.manage", module: "reporting" },
  { key: "reporting.debts.read", module: "reporting" },

  // Registration
  { key: "org.registration.submit", module: "registration" },
  { key: "org.registration.approve", module: "registration" },
  { key: "branch.registration.submit", module: "registration" },
  { key: "branch.registration.approve", module: "registration" },

  // Document numbering
  { key: "document-numbering.manage", module: "document-numbering" },

  // Admin / CRUD
  { key: "admin.crud.manage", module: "admin" },

  // Assignment
  { key: "salesman.assign", module: "assignment" },
  { key: "salesmanager.assign", module: "assignment" },
  { key: "storage.manager.assign", module: "assignment" },

  // Sales hierarchy
  { key: "sales-hierarchy.read", module: "sales-hierarchy" },
  { key: "sales-hierarchy.manage", module: "sales-hierarchy" },

  // Events
  { key: "events.dead-letter.manage", module: "events" },

  // CRUD entity operations
  { key: "crud.entity.read", module: "crud" },
  { key: "crud.entity.create", module: "crud" },
  { key: "crud.entity.update", module: "crud" },
  { key: "crud.entity.delete", module: "crud" },

  // IAM
  { key: "iam.user.read", module: "iam" },
  { key: "iam.user.write", module: "iam" },
  { key: "iam.user.delete", module: "iam" },
  { key: "iam.role.read", module: "iam" },
  { key: "iam.role.write", module: "iam" },
  { key: "iam.role.delete", module: "iam" },
  { key: "iam.role.permissions.write", module: "iam" },
  { key: "iam.user.roles.write", module: "iam" },
  { key: "iam.user.branches.write", module: "iam" },
  { key: "iam.permission.read", module: "iam" },
];

export const PERMISSION_SEEDS: PermissionSeed[] = PERMISSION_DEFINITIONS.map(
  (def) => ({
    ...def,
    description: PERMISSION_LABELS_VI[def.key] ?? def.key,
  }),
);
