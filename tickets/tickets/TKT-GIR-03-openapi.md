# TKT-GIR-03 OpenAPI regen + api-client snapshot

## Epic

[EPIC-08062026 Phiếu xuất kho — round-trip đầy đủ trường](../epics/EPIC-08062026-goods-issue-form-roundtrip.md)

## Layer

🟩 Tooling — regenerate api-client sau khi `CreateGoodsIssueDto` + response shape đổi.

## Summary

DTO tạo phiếu xuất kho thêm `deliverer`/`references`/`occurredAt` và response thêm các trường này → regenerate api-client để FE (nếu dùng client generated) có type mới; commit snapshot.

## Deliverables

- Chạy API (`:4000`) rồi `pnpm openapi:generate`.
- Commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (KHÔNG sửa tay file generated).

## Acceptance Criteria

- [ ] `schema.ts` chứa `deliverer`, `references`, `occurredAt` trong create DTO + goods-issue response.
- [ ] Diff snapshot chỉ gồm thay đổi của epic này.

## Definition of Done

- [ ] `pnpm build` (api-client) xanh; không hand-edit file generated.
- [ ] Snapshot + schema committed trước khi wiring FE (TKT-GIR-04).

## Tech Approach

`pnpm openapi:generate` (API phải đang chạy `:4000`, theo CLAUDE.md). Nếu FE goods-issue page dùng `apiClient` axios trực tiếp (không qua generated client) thì ticket này chỉ để giữ snapshot đồng bộ — vẫn bắt buộc theo DoD repo.

## Dependencies

- Depends on: TKT-GIR-02.
- Blocks: TKT-GIR-04.
