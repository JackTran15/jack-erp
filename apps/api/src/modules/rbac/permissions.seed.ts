export interface PermissionSeed {
  key: string;
  description: string;
  module: string;
}

export const PERMISSION_SEEDS: PermissionSeed[] = [
  // Customer
  { key: 'customer.read', description: 'View customer records', module: 'customer' },
  { key: 'customer.write', description: 'Create and update customer records', module: 'customer' },
  { key: 'customer.merge', description: 'Merge duplicate customer records', module: 'customer' },

  // Branch
  { key: 'branch.read', description: 'View branch information', module: 'branch' },
  { key: 'branch.write', description: 'Create and update branches', module: 'branch' },
  { key: 'branch.archive', description: 'Archive branches', module: 'branch' },

  // Inventory
  { key: 'inventory.read', description: 'View inventory records', module: 'inventory' },
  { key: 'inventory.write', description: 'Create and update inventory records', module: 'inventory' },
  { key: 'inventory.item.read', description: 'View item master data', module: 'inventory' },
  { key: 'inventory.item.write', description: 'Create and update item master data', module: 'inventory' },
  { key: 'inventory.storage.read', description: 'View storage records', module: 'inventory' },
  { key: 'inventory.storage.write', description: 'Create and update storage records', module: 'inventory' },
  { key: 'inventory.showroom.read', description: 'View showroom records', module: 'inventory' },
  { key: 'inventory.showroom.write', description: 'Create and update showroom records', module: 'inventory' },
  { key: 'inventory.location.read', description: 'View location records', module: 'inventory' },
  { key: 'inventory.location.write', description: 'Create and update location records', module: 'inventory' },
  { key: 'inventory.transfer.approve', description: 'Approve inventory transfers', module: 'inventory' },
  { key: 'inventory.adjustment.approve', description: 'Approve inventory adjustments', module: 'inventory' },
  { key: 'inventory.purchase-order.read', description: 'View purchase orders', module: 'inventory' },
  { key: 'inventory.purchase-order.create', description: 'Create purchase orders', module: 'inventory' },
  { key: 'inventory.purchase-order.approve', description: 'Approve purchase orders', module: 'inventory' },
  { key: 'inventory.purchase-order.receive', description: 'Receive goods for purchase orders', module: 'inventory' },
  { key: 'inventory.purchase-order.cancel', description: 'Cancel purchase orders', module: 'inventory' },
  { key: 'inventory.goods-issue.read', description: 'View goods issues', module: 'inventory' },
  { key: 'inventory.goods-issue.create', description: 'Create goods issues', module: 'inventory' },
  { key: 'inventory.goods-issue.approve', description: 'Approve goods issues', module: 'inventory' },
  { key: 'inventory.goods-issue.post', description: 'Post goods issues to ledger', module: 'inventory' },
  { key: 'inventory.goods-issue.cancel', description: 'Cancel goods issues', module: 'inventory' },
  { key: 'goods_receipt.read', description: 'View goods receipts (phiếu nhập kho)', module: 'inventory' },
  { key: 'goods_receipt.write', description: 'Create/update/cancel goods receipts', module: 'inventory' },
  { key: 'goods_receipt.post', description: 'Post goods receipts (commit stock-in)', module: 'inventory' },
  { key: 'inventory.transfer.read', description: 'View inventory transfers', module: 'inventory' },
  { key: 'inventory.transfer.create', description: 'Create inventory transfers', module: 'inventory' },
  { key: 'inventory.transfer.post', description: 'Post inventory transfers', module: 'inventory' },
  { key: 'inventory.transfer.cancel', description: 'Cancel inventory transfers', module: 'inventory' },
  { key: 'inventory.adjustment.read', description: 'View inventory adjustments', module: 'inventory' },
  { key: 'inventory.adjustment.create', description: 'Create inventory adjustments', module: 'inventory' },
  { key: 'inventory.adjustment.submit', description: 'Submit inventory adjustments', module: 'inventory' },
  { key: 'inventory.adjustment.post', description: 'Post inventory adjustments', module: 'inventory' },
  { key: 'inventory.adjustment.cancel', description: 'Cancel inventory adjustments', module: 'inventory' },
  { key: 'inventory.temp-warehouse.read', description: 'View temp warehouse sessions and lines', module: 'inventory' },
  { key: 'inventory.temp-warehouse.write', description: 'Add, update and delete temp warehouse lines', module: 'inventory' },
  { key: 'inventory.temp-warehouse.close', description: 'Close temp warehouse sessions', module: 'inventory' },
  { key: 'inventory.manage', description: 'Manage inventory operations (broad scope)', module: 'inventory' },

  // Product
  { key: 'product.read', description: 'View product records', module: 'product' },
  { key: 'product.write', description: 'Create, update and delete product records', module: 'product' },

  // POS
  { key: 'pos.invoice.read', description: 'View POS invoices', module: 'pos' },
  { key: 'pos.invoice.write', description: 'Create, update and cancel POS invoices', module: 'pos' },
  { key: 'pos.sale.create', description: 'Create POS sales', module: 'pos' },
  { key: 'pos.return.create', description: 'Create POS returns', module: 'pos' },
  { key: 'pos.exchange.create', description: 'Create POS exchanges', module: 'pos' },
  { key: 'pos.session.manage', description: 'Open and close POS sessions', module: 'pos' },
  { key: 'pos.session.approve_variance', description: 'Approve POS session reconciliation variance', module: 'pos' },
  { key: 'pos.promotion.read', description: 'View POS promotions', module: 'pos' },
  { key: 'pos.promotion.write', description: 'Create and update POS promotions', module: 'pos' },

  // Accounting
  { key: 'accounting.journal.post', description: 'Post journal entries', module: 'accounting' },
  { key: 'accounting.journal.reverse', description: 'Reverse journal entries', module: 'accounting' },
  { key: 'accounting.payable.manage', description: 'Manage accounts payable', module: 'accounting' },
  { key: 'accounting.receivable.manage', description: 'Manage accounts receivable', module: 'accounting' },
  { key: 'accounting.cash.read', description: 'View cash accounts and movements', module: 'accounting' },
  { key: 'accounting.cash.create', description: 'Create cash accounts and record movements', module: 'accounting' },
  { key: 'accounting.expenses.read', description: 'View expense records', module: 'accounting' },
  { key: 'accounting.expenses.create', description: 'Create expense records', module: 'accounting' },
  { key: 'accounting.expenses.update', description: 'Update expense records', module: 'accounting' },
  { key: 'accounting.payables.read', description: 'View accounts payable records', module: 'accounting' },
  { key: 'accounting.payables.create', description: 'Create accounts payable records', module: 'accounting' },
  { key: 'accounting.payables.update', description: 'Update accounts payable records', module: 'accounting' },
  { key: 'accounting.receivables.read', description: 'View accounts receivable records', module: 'accounting' },
  { key: 'accounting.receivables.create', description: 'Create accounts receivable records', module: 'accounting' },
  { key: 'accounting.receivables.update', description: 'Update accounts receivable records', module: 'accounting' },
  { key: 'accounting.receivables.write-off', description: 'Write off accounts receivable balances', module: 'accounting' },

  // Reporting
  { key: 'reporting.dashboard.branch.read', description: 'View branch-level dashboards', module: 'reporting' },
  { key: 'reporting.dashboard.consolidated.read', description: 'View consolidated dashboards', module: 'reporting' },

  // Registration
  { key: 'org.registration.submit', description: 'Submit organization registration', module: 'registration' },
  { key: 'org.registration.approve', description: 'Approve organization registration', module: 'registration' },
  { key: 'branch.registration.submit', description: 'Submit branch registration', module: 'registration' },
  { key: 'branch.registration.approve', description: 'Approve branch registration', module: 'registration' },

  // Document numbering
  { key: 'document-numbering.manage', description: 'Manage document numbering sequences', module: 'document-numbering' },

  // Admin / CRUD
  { key: 'admin.crud.manage', description: 'Manage CRUD entity definitions', module: 'admin' },

  // Assignment
  { key: 'salesman.assign', description: 'Assign salesmen to branches', module: 'assignment' },
  { key: 'salesmanager.assign', description: 'Assign sales managers to branches', module: 'assignment' },
  { key: 'storage.manager.assign', description: 'Assign storage managers to branches', module: 'assignment' },

  // Sales hierarchy
  { key: 'sales-hierarchy.read', description: 'View sales hierarchy', module: 'sales-hierarchy' },
  { key: 'sales-hierarchy.manage', description: 'Manage sales hierarchy', module: 'sales-hierarchy' },

  // Events
  { key: 'events.dead-letter.manage', description: 'Manage dead-letter events queue', module: 'events' },

  // CRUD entity operations
  { key: 'crud.entity.read', description: 'Read CRUD entity records', module: 'crud' },
  { key: 'crud.entity.create', description: 'Create CRUD entity records', module: 'crud' },
  { key: 'crud.entity.update', description: 'Update CRUD entity records', module: 'crud' },
  { key: 'crud.entity.delete', description: 'Delete CRUD entity records', module: 'crud' },
];
