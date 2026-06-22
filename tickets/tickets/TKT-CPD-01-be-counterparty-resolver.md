# TKT-CPD-01 BE: util resolve tên Đối tượng dùng chung (filter SQL + inline batch)

## Epic

[EPIC-22062026 Hiển thị "Đối tượng" trên Nhập / Xuất / Chuyển kho](../epics/EPIC-22062026-counterparty-display-inventory-docs.md)

## Summary

Tạo 1 util dùng chung để resolve **tên đối tượng** theo `counterparty_kind` (`supplier` → `providers.name`, `customer` → `customers.name`, `employee` → `users.first_name || ' ' || users.last_name`). Hai mặt:

1. `counterpartyNameSql(alias)` — SQL fragment (CASE + correlated subquery) dùng cho **filter cột Đối tượng** (`FilterBuilder.applyString(expr, dto.party)`), chạy trước phân trang nên filter đúng cho cả 3 loại server-side.
2. `attachCounterparties(manager, rows, orgId)` — **inline** object `counterparty { kind, id, code, name }` vào từng row bằng batch query (gom id theo kind → 1 query/kind), mirror cách `SearchStockTransfersV2Handler` inline `transporter`. Không trả root `{[id]: X}` map.

Các handler Nhập/Xuất/Chuyển kho (CPD-02/03/04) dùng lại util này.

## Deliverables

- `apps/api/src/modules/inventory/location/services/counterparty-name.util.ts` (new) — `counterpartyNameSql`, `attachCounterparties`, interface `CounterpartyDisplay` + `HasCounterparty`.
- (consumed) `resolve-doc-counterparty.util.ts`, `ProviderEntity`, `CustomerEntity` (`../../../customer/customer.entity`), `UserEntity` (`../../../auth/user.entity`), `DocCounterpartyKind` (`@erp/shared-interfaces`).

## Acceptance Criteria

- [ ] `counterpartyNameSql('gr')` trả CASE trên `gr.counterparty_kind`, mỗi nhánh là subquery scope theo `<alias>.organization_id` (mirror subquery transporter sẵn có).
- [ ] `attachCounterparties` chạy **tối đa 1 query/kind** trên 1 danh sách rows (không N+1); set `row.counterparty = { kind, id, code, name }` hoặc `null` khi `counterpartyId` rỗng / không tìm thấy.
- [ ] Tất cả query scope theo `organizationId` truyền vào; không leak cross-tenant.
- [ ] Không có Vietnamese trong source (comment/Swagger/error English).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Có unit spec cho util (3 loại + null) — gộp trong CPD-08.
- [ ] Không sửa schema; `synchronize` false.

## Tech Approach

```ts
// counterparty-name.util.ts
import { EntityManager } from 'typeorm';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { ProviderEntity } from '../provider.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { UserEntity } from '../../../auth/user.entity';

export interface CounterpartyDisplay {
  kind: DocCounterpartyKind;
  id: string;
  code: string | null;
  name: string;
}

export interface HasCounterparty {
  counterpartyKind?: DocCounterpartyKind | null;
  counterpartyId?: string | null;
  counterparty?: CounterpartyDisplay | null; // transient, set by attachCounterparties
}

/** SQL fragment resolving the đối tượng name across all 3 kinds (for the party
 *  column filter). `alias` is the root entity alias, e.g. 'gr' / 'gi' / 'st'. */
export const counterpartyNameSql = (alias: string): string =>
  `CASE ${alias}.counterparty_kind
     WHEN 'supplier' THEN (SELECT p.name FROM providers p
       WHERE p.id = ${alias}.counterparty_id AND p.organization_id = ${alias}.organization_id)
     WHEN 'customer' THEN (SELECT c.name FROM customers c
       WHERE c.id = ${alias}.counterparty_id AND c.organization_id = ${alias}.organization_id)
     WHEN 'employee' THEN (SELECT (u.first_name || ' ' || u.last_name) FROM users u
       WHERE u.id = ${alias}.counterparty_id AND u.organization_id = ${alias}.organization_id)
   END`;

export async function attachCounterparties<T extends HasCounterparty>(
  manager: EntityManager,
  rows: T[],
  organizationId: string,
): Promise<T[]> {
  const idsByKind = new Map<DocCounterpartyKind, Set<string>>();
  for (const r of rows) {
    if (!r.counterpartyKind || !r.counterpartyId) continue;
    (idsByKind.get(r.counterpartyKind) ??
      idsByKind.set(r.counterpartyKind, new Set()).get(r.counterpartyKind)!).add(
      r.counterpartyId,
    );
  }
  const display = new Map<string, CounterpartyDisplay>(); // key = `${kind}:${id}`

  const supplierIds = [...(idsByKind.get(DocCounterpartyKind.SUPPLIER) ?? [])];
  if (supplierIds.length) {
    const rowsP = await manager.find(ProviderEntity, {
      where: supplierIds.map((id) => ({ id, organizationId })),
    });
    for (const p of rowsP)
      display.set(`${DocCounterpartyKind.SUPPLIER}:${p.id}`, {
        kind: DocCounterpartyKind.SUPPLIER, id: p.id, code: p.code ?? null, name: p.name,
      });
  }
  const customerIds = [...(idsByKind.get(DocCounterpartyKind.CUSTOMER) ?? [])];
  if (customerIds.length) {
    const rowsC = await manager.find(CustomerEntity, {
      where: customerIds.map((id) => ({ id, organizationId })),
    });
    for (const c of rowsC)
      display.set(`${DocCounterpartyKind.CUSTOMER}:${c.id}`, {
        kind: DocCounterpartyKind.CUSTOMER, id: c.id, code: c.code ?? null, name: c.name,
      });
  }
  const employeeIds = [...(idsByKind.get(DocCounterpartyKind.EMPLOYEE) ?? [])];
  if (employeeIds.length) {
    const rowsU = await manager.find(UserEntity, {
      where: employeeIds.map((id) => ({ id, organizationId })),
    });
    for (const u of rowsU)
      display.set(`${DocCounterpartyKind.EMPLOYEE}:${u.id}`, {
        kind: DocCounterpartyKind.EMPLOYEE, id: u.id, code: null,
        name: `${u.firstName} ${u.lastName}`.trim(),
      });
  }

  for (const r of rows) {
    r.counterparty =
      r.counterpartyKind && r.counterpartyId
        ? display.get(`${r.counterpartyKind}:${r.counterpartyId}`) ?? null
        : null;
  }
  return rows;
}
```

> Verify lúc implement: `CustomerEntity` có cột `code` không — nếu không, dùng `null`. Tên bảng `providers` / `customers` / `users` (khớp subquery transporter + join `gr.provider` hiện có).

## Dependencies

- Blocks: TKT-CPD-02, TKT-CPD-03, TKT-CPD-04.
