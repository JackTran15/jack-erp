# EPIC-29052026 Supplier & Supplier Group management

## Goal

Deliver full CRUD for **Nhà cung cấp** (Supplier) and **Nhóm nhà cung cấp** (Supplier Group) in the backoffice, matching the provided mockups: a hierarchical supplier-group catalog and a rich supplier form with an Organization/Individual toggle, bank details, debt limits, a contact person, and an "is customer" flag.

## Scope

- New `SupplierGroupEntity` (`provider_groups` table, entityKey `provider-groups`) — self-referencing hierarchy, rendered by the generic CRUD platform.
- **Extend** the existing `ProviderEntity` (`inventory_providers`, entityKey `inventory-providers`) with the full supplier field set — do NOT create a new table; the `supplier_debts.supplier_id` FK stays valid (columns are only ADDed).
- Auto-generated supplier code (`NCC000001…`) via the existing `DocumentNumberingService` (`DocumentType.SUPPLIER`).
- Backoffice: supplier-group page works on the generic `CrudListPage`; supplier list is generic, but create/edit uses a custom form (type toggle + conditional fields + contact person + searchable group picker).

## Success Metrics

- `/admin/provider-groups` and `/admin/inventory-providers` fully usable (list/create/edit/delete) end to end.
- Supplier code auto-generates per org; group/parent names resolve in list rows.
- Existing providers and `supplier_debts` rows unaffected after migration (backfilled `type='organization'`).

## Tickets

- [TKT-SUP-01 Schema: supplier_group entity + provider fields + migration](../tickets/TKT-SUP-01-schema-supplier-group-provider-fields.md)
- [TKT-SUP-02 Supplier Group CRUD service + registration](../tickets/TKT-SUP-02-supplier-group-crud-service.md)
- [TKT-SUP-03 Provider CRUD extension (code-gen, groupName, config)](../tickets/TKT-SUP-03-provider-crud-extension.md)
- [TKT-SUP-04 FE: Supplier Group page + relation searchable picker](../tickets/TKT-SUP-04-fe-supplier-group-page.md)
- [TKT-SUP-05 FE: Supplier custom create/edit form](../tickets/TKT-SUP-05-fe-supplier-form.md)
- [TKT-SUP-06 OpenAPI regen + end-to-end verification](../tickets/TKT-SUP-06-openapi-verification.md)

## Dependencies

- Depends on the generic CRUD platform (`modules/crud`) and `DocumentNumberingModule` (both already shipped).
- Depends on [EPIC-002 Master Data and Branch](./EPIC-002-master-data-and-branch.md) (document numbering rule engine, RBAC).
- Reuses existing `inventory.read` / `inventory.write` permissions — no new permission seeding.
