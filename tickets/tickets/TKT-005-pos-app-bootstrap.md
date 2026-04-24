# TKT-005 POS app bootstrap

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Bootstrap React POS app optimized for fast checkout workflows.

## Deliverables

- `apps/pos-web` scaffold.
- POS shell screens and route baseline.
- Shared contract imports for sales and session models.

## Acceptance Criteria

- POS app runs in local dev mode.
- POS app consumes shared interfaces package for transaction DTOs.

## Downstream

- [TKT-013 POS checkout and returns](./TKT-013-pos-checkout-and-returns.md) (POS shell consumed by checkout UI)

## Dependencies

- [TKT-002 Shared interfaces package](./TKT-002-shared-interfaces-package.md)
