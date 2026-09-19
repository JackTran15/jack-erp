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
| `reporting/invoice-report/queries/get-report-filter-options.handler.ts` | `GET /reports/invoices/filter-options?type=cashier\|salesperson` | Bộ lọc báo cáo; POS Bàn giao ca | Two modes. With an explicit `branchId` (POS sends its active branch) the scope is that branch, `iam.user.read.all` included — checked against `actor.branchIds` first, 403 otherwise — note the bound is the **assignment list**, not the active branch, so an actor assigned to several branches may name any of them without going through `/auth/switch-branch`. Without it, `EmployeeBranchScopeService` as before, which is what keeps the backoffice consolidated cashier filter working. Other `type` values list no people |
| `reporting/cash-fund-report/queries/get-report-filter-options.handler.ts` | `GET /reports/cash-fund/filter-options?type=employee` | Bộ lọc Nhân viên của Bảng kê thu chi và Bảng kê tiền chi theo mục chi (Quỹ tiền) | Only people who appear as staff on at least one cash or bank voucher (`staff_id` / `collected_by` / `paid_by`, `deleted_at IS NULL`) of the actor's assigned branches — every branch for a holder of `reporting.cash.consolidated.read`. INNER JOIN on `employee_profiles`, so a user without a profile never shows. Other `type` values (`store`, `paymentMethod`, `expenseCategory`) list no people |
| `admin-search/queries/search-employees-v2.handler.ts` | `POST /v2/employees/search` | Màn Nhân viên (backoffice) | `UsersService.visibleUserIds()` — every branch the actor belongs to. A different question, deliberately; see ADR-01 |
| `rbac/users.service.ts` `list()` | `GET /admin/users` | Màn Nhân viên (backoffice) | As above |
| `sales-hierarchy/sales-hierarchy.service.ts` | `GET /branches/:id/salesmen`, `GET /branches/:id/sales-managers` | Ô NV bán hàng trên POS Checkout; màn gán NVBH ở backoffice | Branch on the path, via `employeeBranchScopeSqlNamed()` on the profile's linked user. `salesman_assignments` is written by assign/unassign but read by nothing, so it is not the branch link. The controller still declares no `@UseGuards`, so its `@RequireBranchScope()` is inert — scoping here is the service's, not the guard's |
| `sales-order/sales-order.service.ts` `salespeople()` / `salespersonById()` | `GET /mobile/sales-orders/salespeople`; `salespersonId` on `POST`/`PATCH /mobile/sales-orders` | Ô NV bán hàng trên đơn nháp của erp_sales (vai tư vấn, UOW-13) | Branch from `X-Branch-Id` (`@RequireBranchScope()` + `BranchScopeGuard`), via a `user_branch_assignments` join on the profile's linked user — same shape as `sales-hierarchy`, not `EmployeeBranchScopeService`. Both sides `CAST(... AS text)` because the assignment columns are uuid while org ids are varchar. `salespersonById()` runs the same join, so a profile from another branch is rejected on write, not only hidden on read |
| `inventory/temp-warehouse/temp-warehouse.service.ts` `listCarriersForBranch()` | `GET /inventory/temp-warehouse/carriers` | Chọn người vận chuyển (kho tạm) | Branch in the query, via `employeeBranchScopeSqlNamed()` — the same `user_branch_assignments` EXISTS as the pickers above. The `employee_profiles` join is for the code column and search only; it never narrows the set, so an account with no HR profile still lists |

## Not pickers — deliberately unscoped

Resolving a known id to a name is not a picker. Filtering these would blank out the party
on historical documents that reference someone now outside the branch (ADR-04).

| File | Why it lists no choices |
|---|---|
| `inventory/location/services/counterparty-name.util.ts` | id → name for a saved document |
| `inventory/location/services/resolve-doc-counterparty.util.ts` | id → party for a saved document |
| `accounting/cash-vouchers/shared/voucher-staff.resolver.ts` | id → staff for a saved voucher |
| `inventory/transfer/stock-transfer.service.ts` | Hydrates `transporter` from ids already on the rows |
| `inventory/transfer/queries/search-stock-transfers-v2.handler.ts` | As above |
| `pos/services/invoice.service.ts` | id → cashier for one invoice |
| `mobile/services/mobile-invoice.service.ts` | The caller's own profile id, and id → salesperson name for one invoice |
| `reporting/invoice-report/queries/get-invoice-detail.handler.ts` | id → names for one invoice |
| `reporting/invoice-report/reports/invoice-item-revenue-detail.report.ts` | Report rows, not a chooser |
| `reporting/invoice-report/reports/invoice-order-listing.report.ts` | Report rows, not a chooser |
| `reporting/pos-daily-report/pos-daily-summary-export.service.ts` | Export rows, not a chooser |
| `inventory-reports/services/document-detail.service.ts` | id → party name inside a report subquery |
| `customer/csv/customer-export.service.ts` | id → staff name for an export column |
| `customer/csv/customer-import.service.ts` | Matches an imported code/email to one account |
| `auth/auth.service.ts` | Authentication, not selection |
| `api-key/api-key-crud.service.ts` | Creates and deactivates the key's own shadow user; reads no people |
| `rbac/users.service.ts` (write paths) | Same file as the list above; the list is scoped |
| `api-key/api-key-crud.service.ts` | Revoking a key deactivates the service account bound to it (`users.update`) — a write on one known id, nothing is listed |
| `mobile/services/mobile-invoice.service.ts` | Two lookups by id: the caller's own `employee_profiles.id` (to scope "my invoices" — `salesperson_id` is a profile id, not a user id), and id → salesperson name for one invoice |
| `mobile/services/mobile-manager-invoice.service.ts` | id → salesperson name for one invoice, one SQL over `employee_profiles` ⋈ `users`; the invoice list itself is scoped by `branchIds` on `invoices`, not by people |
| `mobile/services/mobile-cashier.service.ts` | id → salesperson name for one draft invoice, same lookup as the two rows above; nothing about people is listed or chosen here — the cart is reached by invoice id and scoped by `X-Branch-Id` |

## Frontend

`apps/pos-web/.../CustomerCreateDialog/MembershipSection` renders a "Nhân viên phụ trách"
select whose `accountManagers` prop defaults to `[]` and is never supplied by any caller.
Nothing to scope today; wiring real data into it would make it a picker, and it belongs in
the table above from that moment.
