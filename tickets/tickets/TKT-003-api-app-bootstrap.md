# TKT-003 API app bootstrap

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Bootstrap NestJS API app with module boundaries and base middleware.

## Deliverables

- `apps/api` scaffold.
- Health, config, logging, and global error handling baseline.
- TypeORM datasource, base entity conventions, and migration tooling setup.
- Import path setup for shared interfaces package.

## Acceptance Criteria

- API starts locally and passes base health endpoint.
- TypeORM connects to PostgreSQL and runs baseline migration successfully.
- Contract types can be imported from `@erp/shared-interfaces`.

## Dependencies

- [TKT-002 Shared interfaces package](./TKT-002-shared-interfaces-package.md)
