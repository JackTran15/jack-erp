# TKT-001 Init pnpm workspace

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Initialize monorepo using `pnpm` workspace with `apps/*` and `packages/*`.

## Deliverables

- Root `package.json` with workspace scripts.
- `pnpm-workspace.yaml` configured for apps and packages.
- Base TypeScript configuration for shared usage.

## Acceptance Criteria

- `pnpm install` completes successfully.
- `pnpm -r build` runs across workspace.

## Dependencies

- None.
