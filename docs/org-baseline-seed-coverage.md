# `org-baseline.seed.ts` — Entity Coverage Gap

> Source: `apps/api/src/database/seeds/org-baseline.seed.ts`
> Generated: 2026-06-30 · Total persisted entities in API: **104** · Seeded: **11** · Not seeded: **93**

## What the seed provisions

The seed deliberately provisions only the **org-wide foundation** — what
`OrganizationService.create()` gives a runtime org (COA, default-account roles,
cash-voucher categories, membership card types) plus org/user/RBAC and an extra
`payment_accounts` set so POS checkout resolves once a branch exists. It seeds
**nothing branch-, product-, or transaction-scoped**; the admin logs in
(`branchIds: []`) and creates branches, products, and stock through the app.

| Table                        | Module       | Provisioned by                                          |
| ---------------------------- | ------------ | ------------------------------------------------------- |
| `organizations`              | organization | seed                                                    |
| `users`                      | auth         | seed                                                    |
| `roles`                      | auth         | seed                                                    |
| `permissions`                | auth         | seed                                                    |
| `role_permissions`           | auth         | seed                                                    |
| `user_roles`                 | auth         | seed                                                    |
| `accounts` (COA)             | accounting   | `CoaSeederService` (same as runtime org-create)         |
| `accounting_default_account` | accounting   | `DefaultAccountSeederService` (same as runtime)         |
| `cash_voucher_categories`    | accounting   | `CashVoucherCategorySeederService` (same as runtime)    |
| `membership_card_types`      | customer     | `MembershipCardTypeSeederService` (same as runtime)     |
| `payment_accounts`           | accounting   | seed **only** (runtime org-create does *not* add these) |

> Note: runtime `OrganizationService.create()` runs the four seeder services
> above but **not** `payment_accounts`. The seed adds them on top — so the seed
> is a strict superset of runtime org provisioning.

---

## Entities NOT generated (93)

Grouped by *why* they are absent.

### 1. Org & branch structure — created at runtime via branch creation (by design)

| Table                         | Module                                               |
| ----------------------------- | ---------------------------------------------------- |
| `branches`                    | branch                                               |
| `user_branch_assignments`     | branch                                               |
| `storages`                    | inventory (location)                                 |
| `locations`                   | inventory (location)                                 |
| `showrooms`                   | inventory (location)                                 |
| `storage_manager_assignments` | inventory                                            |
| `cash_accounts`               | accounting (auto-provisioned per branch, 1× TK 1111) |

### 2. Product / catalog master data — entered manually after login (by design)

| Table                           | Module    |
| ------------------------------- | --------- |
| `products`                      | inventory |
| `product_attribute_definitions` | inventory |
| `product_attribute_options`     | inventory |
| `items`                         | inventory |
| `item_attribute_values`         | inventory |
| `item_barcodes`                 | inventory |
| `item_units`                    | inventory |
| `item_providers`                | inventory |
| `item_stock_thresholds`         | inventory |
| `item_storage_locations`        | inventory |
| `inventory_providers`           | inventory |
| `provider_groups`               | inventory |

### 3. Transactional / ledger / saga — immutable runtime records (never seeded)

| Table                                                            | Module     |
| ---------------------------------------------------------------- | ---------- |
| `cash_payments`, `cash_payment_lines`                            | accounting |
| `cash_receipts`, `cash_receipt_lines`                            | accounting |
| `cash_counts`, `cash_movements`                                  | accounting |
| `cash_debt_collection_saga`, `cash_supplier_debt_payment_saga`   | accounting |
| `expenses`                                                       | accounting |
| `journal_entries`, `journal_lines`                               | accounting |
| `payables`, `payable_settlements`                                | accounting |
| `receivables`, `receivable_settlements`                          | accounting |
| `supplier_debts`, `supplier_debt_payments`                       | inventory  |
| `invoices`, `invoice_items`, `invoice_payments`, `invoice_debts` | pos        |
| `invoice_promotions`                                             | promotion  |
| `debt_payments`                                                  | pos        |
| `pos_sessions`, `pos_session_reconciliations`                    | pos        |
| `goods_receipts`, `goods_receipt_lines`                          | inventory  |
| `goods_issues`, `goods_issue_lines`                              | inventory  |
| `purchase_orders`, `purchase_order_lines`                        | inventory  |
| `stock_adjustments`, `stock_adjustment_lines`                    | inventory  |
| `stock_takes`, `stock_take_lines`, `stock_take_members`          | inventory  |
| `stock_transfers`, `stock_transfer_lines`                        | inventory  |
| `transfer_orders`, `transfer_order_lines`                        | inventory  |
| `temp_warehouse_sessions`, `temp_warehouse_lines`                | inventory  |
| `stock_ledger_entries`, `stock_balances`                         | inventory  |
| `inventory_import_jobs`, `inventory_import_job_rows`             | inventory  |
| `customer_credits`, `point_history`, `membership_cards`          | customer   |
| `customers`                                                      | customer   |

### 4. Infrastructure / self-provisioning — not a seed concern

| Table                      | Module             | Why excluded                                       |
| -------------------------- | ------------------ | -------------------------------------------------- |
| `dead_letter_events`       | events             | event-bus plumbing                                 |
| `outbox_messages`          | events             | event-bus plumbing                                 |
| `processed_events`         | events             | consumer dedupe table                              |
| `document_number_rules`    | document-numbering | **auto-created on demand** on first document issue |
| `document_number_counters` | document-numbering | auto-created with the rule                         |
| `registration_requests`    | registration       | self-signup inbound records                        |

### 5. Reference / config & operational data — NOT defaulted (potential gaps)

These are not transactional, yet the seed (and runtime org-create) leave them
empty. Whether any *should* ship with defaults is a product decision — flagged
here for review.

| Table                                 | Module          | Nature                                       |
| ------------------------------------- | --------------- | -------------------------------------------- |
| `customer_groups`                     | customer        | reference / lookup                           |
| `inventory_units`                     | inventory       | unit-of-measure lookup                       |
| `inventory_brands`                    | inventory       | brand lookup                                 |
| `inventory_item_categories`           | inventory       | category tree                                |
| `inventory_item_category_commissions` | inventory       | category config                              |
| `issue_reasons`                       | inventory       | goods-issue reason lookup                    |
| `report_types`                        | reporting       | report registry (see `report-types.seed.ts`) |
| `invoice_report_templates`            | reporting       | print templates                              |
| `job_positions`                       | hr              | HR reference                                 |
| `employee_profiles`                   | rbac            | HR records (runtime)                         |
| `employee_addresses`                  | rbac            | HR records (runtime)                         |
| `employee_emergency_contacts`         | rbac            | HR records (runtime)                         |
| `employee_access_schedules`           | rbac            | HR records (runtime)                         |
| `promotions`                          | promotion       | operational (user-created)                   |
| `discount_codes`                      | promotion       | operational (user-created)                   |
| `vouchers`                            | promotion       | operational (user-created)                   |
| `sales_manager_assignments`           | sales-hierarchy | runtime assignment                           |
| `salesman_assignments`                | sales-hierarchy | runtime assignment                           |

---

## Takeaway

The only **deliberate config difference** between this seed and a runtime org is
`payment_accounts` (seed adds them; runtime org-create does not). Everything in
categories 1–4 is absent **by design**. Category 5 lists reference/lookup tables
that currently ship empty in both paths — review if any warrant default rows
(`report_types` already has a standalone `report-types.seed.ts`).
