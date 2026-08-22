# Employee-listing surfaces

Every query in this repo that returns a list of people for a user to **pick from**, and
what scopes it.

This table is only true for as long as `employee-listing-surfaces.spec.ts` runs. That test
fails when a query over `users` / `employee_profiles` appears in a file this table does not
name. If the test is ever disabled, delete this file too rather than leave a document that
looks authoritative and is not.

## Pickers — must be scoped to a branch

| File | Endpoint | Surface | Scope |
|---|---|---|---|
| `counterparty/queries/search-counterparties.handler.ts` | `POST /v2/counterparties/search` | Ô Đối tượng: Nhập kho, Xuất kho, Chuyển kho | Active branch, via `EmployeeBranchScopeService` |
| `accounting/cash-vouchers/shared/partner-lookup.service.ts` | `GET /cash-vouchers/partners` | Phiếu thu/chi tiền mặt + tiền gửi: ô Đối tượng **và** ô Nhân viên thu/chi | Active branch, via `EmployeeBranchScopeService`. `mode: 'none'` unreachable over HTTP — `@RequireBranchScope()` answers 403 first (ADR-05) |
| `reporting/invoice-report/queries/get-report-filter-options.handler.ts` | `GET /reports/invoices/filter-options?type=cashier\|salesperson` | Bộ lọc báo cáo; POS Bàn giao ca | Active branch, via `EmployeeBranchScopeService`. Other `type` values list no people |
| `admin-search/queries/search-employees-v2.handler.ts` | `POST /v2/employees/search` | Màn Nhân viên (backoffice) | `UsersService.visibleUserIds()` — every branch the actor belongs to. A different question, deliberately; see ADR-01 |
| `rbac/users.service.ts` `list()` | `GET /admin/users` | Màn Nhân viên (backoffice) | As above |
| `sales-hierarchy/sales-hierarchy.service.ts` | `GET /branches/:id/salesmen` | Chọn NVBH trên POS | Branch on the path, enforced by `@RequireBranchScope()` |
| `inventory/temp-warehouse/temp-warehouse.service.ts` `listCarriersForBranch()` | `GET /inventory/temp-warehouse/carriers` | Chọn người vận chuyển (kho tạm) | Branch in the query, joined through `user_branch_assignments` before the user query |

## Not pickers — deliberately unscoped

Resolving a known id to a name is not a picker. Filtering these would blank out the party
on historical documents that reference someone now outside the branch (ADR-04).

| File | Why it lists no choices |
|---|---|
| `inventory/location/services/counterparty-name.util.ts` | id → name for a saved document |
| `inventory/location/services/resolve-doc-counterparty.util.ts` | id → party for a saved document |
| `accounting/deposit-vouchers/shared/voucher-staff.resolver.ts` | id → staff for a saved voucher |
| `inventory/transfer/stock-transfer.service.ts` | Hydrates `transporter` from ids already on the rows |
| `inventory/transfer/queries/search-stock-transfers-v2.handler.ts` | As above |
| `pos/services/invoice.service.ts` | id → cashier for one invoice |
| `reporting/invoice-report/queries/get-invoice-detail.handler.ts` | id → names for one invoice |
| `reporting/invoice-report/reports/invoice-item-revenue-detail.report.ts` | Report rows, not a chooser |
| `reporting/invoice-report/reports/invoice-order-listing.report.ts` | Report rows, not a chooser |
| `reporting/pos-daily-report/pos-daily-summary-export.service.ts` | Export rows, not a chooser |
| `inventory-reports/services/document-detail.service.ts` | id → party name inside a report subquery |
| `customer/csv/customer-export.service.ts` | id → staff name for an export column |
| `customer/csv/customer-import.service.ts` | Matches an imported code/email to one account |
| `auth/auth.service.ts` | Authentication, not selection |
| `rbac/users.service.ts` (write paths) | Same file as the list above; the list is scoped |

## Frontend

`apps/pos-web/.../CustomerCreateDialog/MembershipSection` renders a "Nhân viên phụ trách"
select whose `accountManagers` prop defaults to `[]` and is never supplied by any caller.
Nothing to scope today; wiring real data into it would make it a picker, and it belongs in
the table above from that moment.
