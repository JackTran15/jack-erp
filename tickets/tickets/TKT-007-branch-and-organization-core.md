# TKT-007 Branch and organization core

## Epic

[EPIC-002 Master Data and Branch](../epics/EPIC-002-master-data-and-branch.md)

## Summary

Implement organization and branch entities, assignments, and lifecycle operations.

## Deliverables

- Organization/branch schema and APIs.
- Default main-branch creation on organization bootstrap.
- Sub-branch hierarchy model under main branch.
- Default main storage and main showroom creation for main branch.
- Registration request models and status lifecycle for organization/branch onboarding.
- User-to-branch assignment capabilities.
- Branch archive/suspend lifecycle enforcement.

## Acceptance Criteria

- Branch creation and assignment workflows are operational.
- Branch state transitions are validated and audited.
- Every organization has exactly one default main branch.
- Sub branches can be created and managed under the main branch model.
- Main branch provisioning automatically creates main storage and main showroom.
- Registration requests support pending/approved/rejected lifecycle with audit records.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
