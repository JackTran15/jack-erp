# TKT-RBI-05 Tests + E2E + DoD

## Epic

[EPIC-15062026 Doanh thu theo mặt hàng](../epics/EPIC-15062026-revenue-by-item-report.md)

## Summary

Đóng gói report type #4: unit (aggregator + handler) đã ở RBI-02/03; ticket này thêm **E2E round-trip** và gate DoD, chứng minh generic + no-regress 3 type cũ.

## Deliverables

- `apps/api/test/e2e/...revenue-by-item...e2e-spec.ts` — round-trip types/columns/search.
- (Nếu chưa có) bổ sung unit còn thiếu cho aggregator/handler.

## Acceptance Criteria

- [ ] **E2E** trên `erp_test`: seed org+branch+items (đủ category + brand) + invoices/line-items; assert:
  - `GET types` chứa `revenue-by-item`; `GET columns?reportType=revenue-by-item` đúng catalog.
  - `POST search groupBy=item` → một dòng/mặt hàng, Σ đúng (SL/Tiền hàng/Khuyến mại/Doanh thu) + totals.
  - `POST search groupBy=group` → gộp theo nhóm hàng; `groupBy=brand` → gộp theo thương hiệu.
  - Lọc `categoryId` + `brand` thu hẹp đúng; `columnFilters` (`=`/`≤`) post-aggregate đúng; phân trang `total`=số nhóm.
  - `filters.issuedAt` thiếu → 400; cột lạ → 400.
- [ ] **No-regress:** chạy lại search/columns cho `daily-sales-summary`/`invoice-order-listing`/`invoice-item-revenue-detail` — không đổi.
- [ ] Template CQRS tạo được template `reportType='revenue-by-item'` (cột thuộc catalog của nó).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `test:e2e` + `lint` xanh (đọc output thật — teardown Kafka treo có thể giả "suite failed").
- [ ] `openapi:generate` đã chạy (RBI-04); snapshot + `schema.ts` committed.
- [ ] `synchronize` false; KHÔNG migration/entity/endpoint/permission mới.
- [ ] Không Vietnamese trong backend source. Không TODO/FIXME ngoài plan.
- [ ] FE chưa nối — renderer generic tự hiển thị report mới khi user chọn trong dropdown.

## Testing Strategy

- Unit: aggregator (RBI-02) + handler (RBI-03).
- E2E: 1 spec round-trip + no-regress assertions.

## Dependencies

- Depends on: TKT-RBI-04 (+ TKT-RBI-02 cho unit aggregator)
- Blocks: —
