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

  // POS
  { key: 'pos.sale.create', description: 'Create POS sales', module: 'pos' },
  { key: 'pos.return.create', description: 'Create POS returns', module: 'pos' },
  { key: 'pos.exchange.create', description: 'Create POS exchanges', module: 'pos' },
  { key: 'pos.session.manage', description: 'Open and close POS sessions', module: 'pos' },

  // Accounting
  { key: 'accounting.journal.post', description: 'Post journal entries', module: 'accounting' },
  { key: 'accounting.journal.reverse', description: 'Reverse journal entries', module: 'accounting' },
  { key: 'accounting.payable.manage', description: 'Manage accounts payable', module: 'accounting' },
  { key: 'accounting.receivable.manage', description: 'Manage accounts receivable', module: 'accounting' },

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

  // CRUD entity operations
  { key: 'crud.entity.read', description: 'Read CRUD entity records', module: 'crud' },
  { key: 'crud.entity.create', description: 'Create CRUD entity records', module: 'crud' },
  { key: 'crud.entity.update', description: 'Update CRUD entity records', module: 'crud' },
  { key: 'crud.entity.delete', description: 'Delete CRUD entity records', module: 'crud' },
];
