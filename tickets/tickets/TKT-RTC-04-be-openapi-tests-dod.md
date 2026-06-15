# TKT-RTC-04 BE: openapi regen + tests + E2E + DoD

## Epic

[EPIC-15062026 Cấu hình cột báo cáo theo template](../epics/EPIC-15062026-report-template-column-config.md)

## Summary

Đóng gói epic: regen OpenAPI/api-client cho shape `columns` mới, viết unit + E2E round-trip, và gate Definition of Done. Không thêm endpoint — chỉ phản ánh đổi DTO/view.

## Deliverables

- Chạy API + `pnpm openapi:generate`; commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (không sửa tay).
- `apps/api/src/modules/reporting/invoice-report/commands/*.spec.ts` — unit handler (nếu chưa gộp ở TKT-RTC-03).
- E2E (`apps/api/test/e2e/...`) — round-trip template với record cột.

## Acceptance Criteria

- [ ] OpenAPI/schema phản ánh `columns` = mảng record (`col/displayName/visible/frozen/order`) ở request (Create/Update) + response (View).
- [ ] **Unit** phủ đủ nhánh validate/normalize của Create + Update: valid theo 3 reportType, unknown-col-reject-theo-reportType, duplicate-col, no-visible-reject, order-normalize-từ-array-index, displayName-trim→null, empty-array-reject (create), update full-replace + bỏ qua khi không gửi `columns`.
- [ ] **E2E** round-trip: `POST templates` (record cột) → `GET templates/:id` trả đúng record → `PATCH` đổi visible/frozen/order/displayName → `GET` phản ánh → `GET templates?reportType=` liệt kê. Có 1 case dùng report type ≠ `daily-sales-summary` để chứng minh generic.
- [ ] **Migration E2E**: trên `erp_test`, template seed `columns` dạng `string[]` cũ → sau `up` đọc ra record hợp lệ (kiểm qua `GET`).
- [ ] No-regress: search/columns/types + 2 report type kia vẫn chạy.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` + `lint` xanh.
- [ ] `openapi:generate` đã chạy; snapshot + generated `schema.ts` committed.
- [ ] `synchronize` vẫn false; không schema change ngoài migration TKT-RTC-02.
- [ ] Không Vietnamese trong backend source. Không TODO/FIXME ngoài plan.
- [ ] FE chưa nối — note "deferred FE" giữ trong epic (breaking type `columns` sẽ do FE epic xử lý).

## Tech Approach

- Chạy API (`make dev-api`) trước khi `openapi:generate` (cần `:4000`).
- E2E theo pattern `apps/api/test/e2e` (global-setup tự tạo `erp_test` + chạy migration) — chạy serial `maxWorkers:1`, đọc output thật (teardown Kafka treo có thể giả "suite failed").

## Testing Strategy

- Unit: như Acceptance.
- E2E: 1 spec file cho template-column round-trip + migration assertion.

## Dependencies

- Depends on: TKT-RTC-03
- Blocks: —
