# TKT-IVR-07 openapi:generate + api-client snapshot

## Epic

[EPIC-06072026 Báo cáo kho hàng theo structure báo cáo bán hàng](../epics/EPIC-06072026-inventory-report-v2.md)

## Summary

Regenerate OpenAPI snapshot + `@erp/api-client` sau khi toàn bộ endpoint backend mới (columns/search/filter-options/templates của `/reports/inventory`) đã land, chuẩn bị cho 2 ticket FE.

## Deliverables

- Chạy API local → `pnpm openapi:generate`.
- Commit: `apps/api/openapi.snapshot.json` (hoặc vị trí snapshot hiện hành) + `packages/api-client/src/generated/schema.ts` (không hand-edit).

## Acceptance Criteria

- [ ] Snapshot chứa đủ routes mới của `reports/inventory` (columns, search, filter-options, templates CRUD) với DTO schemas đúng.
- [ ] Không diff ngoài phần thêm mới + phần phát sinh cơ học từ rename entity (nếu có).
- [ ] `pnpm build:shared` + build 2 app xanh với client mới.

## Definition of Done

- [ ] Generated files committed nguyên trạng máy generate.
- [ ] Không TODO/FIXME.

## Dependencies

- Depends on: TKT-IVR-03, TKT-IVR-04, TKT-IVR-05, TKT-IVR-06
- Blocks: TKT-IVR-08, TKT-IVR-09
