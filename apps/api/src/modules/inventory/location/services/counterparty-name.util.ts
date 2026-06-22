import { EntityManager } from 'typeorm';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { ProviderEntity } from '../provider.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { UserEntity } from '../../../auth/user.entity';

/** Resolved "Đối tượng" for display — inlined onto a document row. */
export interface CounterpartyDisplay {
  kind: DocCounterpartyKind;
  id: string;
  code: string | null;
  name: string;
}

/**
 * Anything carrying a polymorphic counterparty (goods receipt / issue / stock
 * transfer). `counterparty` is transient — set by {@link attachCounterparties}.
 */
export interface HasCounterparty {
  counterpartyKind?: DocCounterpartyKind | null;
  counterpartyId?: string | null;
  counterparty?: CounterpartyDisplay | null;
}

/**
 * SQL fragment that resolves the đối tượng display name across all three kinds
 * via correlated subqueries. Use it in `FilterBuilder.applyString(expr, party)`
 * so the "Đối tượng" column filter runs server-side (before pagination) and
 * matches suppliers, customers and employees alike — not just providers.
 *
 * `alias` is the root entity alias of the query, e.g. 'gr' / 'gi' / 'st'.
 */
export const counterpartyNameSql = (alias: string): string =>
  `CASE ${alias}.counterparty_kind
     WHEN 'supplier' THEN (SELECT p.name FROM inventory_providers p
       WHERE p.id = ${alias}.counterparty_id AND p.organization_id = ${alias}.organization_id)
     WHEN 'customer' THEN (SELECT c.name FROM customers c
       WHERE c.id = ${alias}.counterparty_id AND c.organization_id = ${alias}.organization_id)
     WHEN 'employee' THEN (SELECT (u.first_name || ' ' || u.last_name) FROM users u
       WHERE u.id = ${alias}.counterparty_id AND u.organization_id = ${alias}.organization_id)
   END`;

/**
 * Batch-resolve the đối tượng of a list of documents and inline a
 * `counterparty` { kind, id, code, name } object onto each row (mutates in
 * place). Ids are grouped by kind so each kind costs at most one query — no
 * N+1. Mirrors how StockTransferService inlines `transporter`.
 */
export async function attachCounterparties<T extends HasCounterparty>(
  manager: EntityManager,
  rows: T[],
  organizationId: string,
): Promise<T[]> {
  const idsByKind = new Map<DocCounterpartyKind, Set<string>>();
  for (const r of rows) {
    if (!r.counterpartyKind || !r.counterpartyId) continue;
    let set = idsByKind.get(r.counterpartyKind);
    if (!set) {
      set = new Set();
      idsByKind.set(r.counterpartyKind, set);
    }
    set.add(r.counterpartyId);
  }

  // key = `${kind}:${id}`
  const display = new Map<string, CounterpartyDisplay>();

  const supplierIds = [...(idsByKind.get(DocCounterpartyKind.SUPPLIER) ?? [])];
  if (supplierIds.length) {
    const providers = await manager.find(ProviderEntity, {
      where: supplierIds.map((id) => ({ id, organizationId })),
    });
    for (const p of providers) {
      display.set(`${DocCounterpartyKind.SUPPLIER}:${p.id}`, {
        kind: DocCounterpartyKind.SUPPLIER,
        id: p.id,
        code: p.code ?? null,
        name: p.name,
      });
    }
  }

  const customerIds = [...(idsByKind.get(DocCounterpartyKind.CUSTOMER) ?? [])];
  if (customerIds.length) {
    const customers = await manager.find(CustomerEntity, {
      where: customerIds.map((id) => ({ id, organizationId })),
    });
    for (const c of customers) {
      display.set(`${DocCounterpartyKind.CUSTOMER}:${c.id}`, {
        kind: DocCounterpartyKind.CUSTOMER,
        id: c.id,
        code: c.code ?? null,
        name: c.name,
      });
    }
  }

  const employeeIds = [...(idsByKind.get(DocCounterpartyKind.EMPLOYEE) ?? [])];
  if (employeeIds.length) {
    const users = await manager.find(UserEntity, {
      where: employeeIds.map((id) => ({ id, organizationId })),
    });
    for (const u of users) {
      display.set(`${DocCounterpartyKind.EMPLOYEE}:${u.id}`, {
        kind: DocCounterpartyKind.EMPLOYEE,
        id: u.id,
        code: null,
        name: `${u.firstName} ${u.lastName}`.trim(),
      });
    }
  }

  for (const r of rows) {
    r.counterparty =
      r.counterpartyKind && r.counterpartyId
        ? display.get(`${r.counterpartyKind}:${r.counterpartyId}`) ?? null
        : null;
  }
  return rows;
}
