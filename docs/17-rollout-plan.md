# Rollout Plan

## Rollout Principles

- Deliver in phases with measurable readiness gates.
- Prioritize data integrity and operational continuity.
- Keep branch onboarding controlled and reversible.

## Phase 1: Foundation and Master Data

Scope:

- `pnpm` workspace monorepo setup (`apps/*`, `packages/*`)
- Shared interfaces package bootstrap and adoption policy
- Redpanda and Redis baseline infrastructure in `dev` and `staging`
- Organization and branch setup
- User, role, and permission setup
- Customer and item master setup

Exit criteria:

- API and frontend apps consume `@erp/shared-interfaces`
- Redpanda topics and Redis baseline caches are provisioned and validated
- RBAC and branch scoping validated
- Master data import baseline completed
- Audit logging operational

## Phase 2: Inventory Operations

Scope:

- Storage/showroom/location model live
- Transfers, adjustments, and stock ledgers
- CSV import/export for inventory

Exit criteria:

- Stock ledger and balance reconciliation pass
- Import error rates within agreed threshold
- Branch inventory team training completed

## Phase 3: POS Rollout

Scope:

- POS terminals and session controls
- Checkout, returns, and reconciliation
- Integration to inventory and accounting postings

Exit criteria:

- Pilot branches meet checkout performance target
- Session close variance under threshold
- Cash controls approved by finance

## Phase 4: Accounting Control Activation

Scope:

- Chart of accounts and posting rules
- Payables, receivables, expenses, and cash workflows
- Core financial reporting

Exit criteria:

- Journal balancing and period-close controls validated
- Aged payables/receivables reports accepted by finance
- Reversal workflow approved

## Phase 5: Organization-Wide Scale and Optimization

Scope:

- Consolidated reporting
- Performance tuning
- Operational hardening and support playbooks

Exit criteria:

- SLA/SLO targets met for 2 consecutive cycles
- Incident response runbook validated
- Go-live sign-off from business and technical stakeholders

## Key Risks and Mitigations

- Data migration errors:
  - Mitigation: validation-first imports, dry runs, and reconciliation reports.
- Unauthorized cross-branch access:
  - Mitigation: branch-scoped policy tests and audit monitoring.
- Ledger mismatch between modules:
  - Mitigation: daily reconciliation jobs and blocking alerts.
- POS disruption during rollout:
  - Mitigation: pilot-first deployment and rollback playbook.

## Readiness Gates Checklist

- Functional readiness: critical workflows pass UAT.
- Data readiness: reconciliation checks pass.
- Operational readiness: monitoring and on-call prepared.
- Security readiness: access review completed.
- Business readiness: user training and SOP sign-off completed.
