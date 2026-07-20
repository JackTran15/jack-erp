# TKT-PRF-05 OpenAPI regen + api-client snapshot

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Sau khi 3 report definition (TKT-PRF-02..04) hoàn tất và `ProfitReportController`
(TKT-PRF-01) expose đủ endpoint (`columns`/`search`/`filter-options`/`templates`), chạy API
+ regenerate OpenAPI client để FE (TKT-PRF-06+) có type-safe client.

## Deliverables

- Chạy `apps/api` local, gọi thử 4 nhóm endpoint qua Swagger (`/docs`) hoặc curl cho cả 3
  `reportType` (`profit-by-item` với cả 3 `statBy`, `gross-profit-by-invoice`,
  `business-results` với 2 kỳ) để xác nhận response hợp lệ trước khi regen.
- `pnpm openapi:generate` — cập nhật `openapi.snapshot.json` +
  `packages/api-client/src/generated/schema.ts`.
- Commit snapshot + generated file (không sửa tay `schema.ts`).

## Acceptance Criteria

- [ ] `openapi.snapshot.json` chứa đủ path `/reports/profit/columns`,
      `/reports/profit/search`, `/reports/profit/filter-options`,
      `/reports/profit/templates` (+ `/templates/:id`).
- [ ] `packages/api-client` build sạch (`pnpm --filter @erp/api-client build`).

## Definition of Done

- [ ] `pnpm build` (workspace-wide) không lỗi type sau khi client regen.
- [ ] Snapshot + generated `schema.ts` nằm trong cùng 1 PR, không tách rời.

## Tech Approach

Theo đúng quy trình đã ghi trong `CLAUDE.md`: "Sau khi thay đổi API endpoint: chạy API, sau
đó `pnpm openapi:generate`. Commit `openapi.snapshot.json` và
`packages/api-client/src/generated/schema.ts` đã cập nhật."

## Testing Strategy

- Không cần test riêng — bước generate + build là gate.

## Dependencies

- Depends on: TKT-PRF-02, TKT-PRF-03, TKT-PRF-04.
- Blocks: TKT-PRF-06.
