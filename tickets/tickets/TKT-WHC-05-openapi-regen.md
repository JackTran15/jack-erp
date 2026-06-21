# TKT-WHC-05 openapi:generate + api-client snapshot

## Epic

[EPIC-21062026 Warehouse Code Auto-Generation](../epics/EPIC-21062026-warehouse-code-autogen.md)

## Summary

Enum `DocumentType` lộ ra `/docs-json` qua các DTO của `document-numbering` (vd `CreateDocumentNumberRuleDto.documentType`). Sau khi thêm `WAREHOUSE`, cần regen api-client để FE dùng type đồng bộ.

## Deliverables

- Chạy API local (`make dev-api`) rồi `pnpm openapi:generate`.
- Commit: `apps/api/.../openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (KHÔNG hand-edit file generated).

## Acceptance Criteria

- [ ] `schema.ts` chứa `WAREHOUSE` trong enum `DocumentType` (nếu enum được surface).
- [ ] Diff snapshot chỉ gồm thay đổi liên quan (enum WAREHOUSE); không drift ngoài ý muốn.

## Definition of Done

- [ ] `pnpm build` (shared + api-client) xanh.
- [ ] Snapshot + generated schema đã commit.
- [ ] Nếu enum **không** surface trong `/docs-json` → ghi rõ trong PR là "no client change needed" và đóng ticket.

## Tech Approach

- `make dev-api` → đợi `/docs-json` sẵn sàng → `pnpm openapi:generate`.

## Testing Strategy

- Build api-client + type-check FE consumer (nếu có chỗ dùng `DocumentType`).

## Dependencies

- Depends on: TKT-WHC-01, TKT-WHC-02
- Blocks: TKT-WHC-06
