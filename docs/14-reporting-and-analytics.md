# Reporting and Analytics

## Purpose

Define operational and financial reporting outputs needed for day-to-day control and management decisions.

## Reporting Dimensions

- Organization
- Branch
- Date/time period
- Customer
- Item/category
- Payment method

## Core Reports

## Sales and POS

- Daily sales summary (branch and consolidated)
- Sales by item/category
- Returns and refund trends
- Cashier/session performance

## Inventory

- Stock on hand by location
- Low stock and out-of-stock alerts
- Stock movement history
- Inventory valuation snapshot

## Accounting

- Trial balance
- Profit and loss
- Balance sheet
- General ledger details
- Cash movement summary

## Receivables and Payables

- Receivables aging
- Payables aging
- Overdue accounts
- Collection and settlement performance

## KPI Definitions

- Gross sales = sum of line totals before returns.
- Net sales = gross sales - returns.
- Inventory turnover = COGS / average inventory value.
- Receivable days outstanding = average receivables / average daily credit sales.
- Payable days outstanding = average payables / average daily purchases/expenses.

## Data Freshness and Performance

- Operational reports: near real-time (under 5 minutes lag target).
- Financial statements: run on-demand with optional scheduled snapshots.
- Heavy reports can use asynchronous job execution with downloadable output.
- Report job completion should emit WebSocket notification events to requestor scope.

## Access Control

- Financial reports require elevated accounting/reporting permissions.
- Branch users can only view branch-scoped report data.
- Organization users can view consolidated and branch drill-down views.
- Main branch dashboard users can view aggregated charts/tables across all organization branches when granted consolidated permissions.
- Branch admins can only view reports for branches explicitly granted by RBAC scope.

## Dashboard Behavior by Branch Role

- Main branch dashboard:
  - Shows organization-level KPI cards and branch-comparison charts/tables.
  - Supports drill-down from aggregate view to individual branch details.
- Sub-branch dashboard:
  - Shows only local branch metrics by default.
  - Consolidated widgets are hidden unless consolidated permission is granted.

## Acceptance Criteria

- Reports align with posted transaction data.
- KPI formulas are documented and consistent.
- Branch and role scoping is enforced for all report endpoints.
- Main branch aggregate dashboard includes all branches with filter and drill-down support.
- Branch admins cannot access ungranted branch report data.
