# TKT-DUE-08 Tests + E2E + DoD gate

## Epic

[EPIC-16062026 POS công nợ — Hạn thanh toán](../epics/EPIC-16062026-pos-debt-due-date.md)

## Summary

Cổng chất lượng cuối: e2e round-trip checkout công nợ kèm due date, e2e org default read-after-write, và xác nhận các unit spec của từng ticket đã xanh. Đảm bảo migration không phá dữ liệu cũ.

## Deliverables

- E2E (`apps/api/test/e2e/`): checkout 1 hóa đơn công nợ với `{ dueDate, creditDays }` → assert response status `DEBT`/`PARTIAL_DEBT` và dòng `invoice_debts` có `due_date` + `credit_days` đúng.
- E2E: PATCH org pos-settings `defaultCreditDays = 30` → GET trả 30.
- (Tùy chọn) e2e cron: seed debt `due_date` = hôm qua, gọi `OverdueDebtsService.markOverdue()` → status `OVERDUE`.
- Verify migration: chạy trên DB có sẵn debt cũ → `credit_days` NULL, không lỗi.

## Acceptance Criteria

- [ ] E2E checkout-due-date xanh: `invoice_debts.due_date` + `credit_days` khớp input.
- [ ] E2E org default xanh: read-after-write trả đúng.
- [ ] Unit của TKT-DUE-02/03/04 đều xanh (gom verify ở đây).
- [ ] `dueDate < issuedAt` → checkout trả 400 (e2e hoặc unit).
- [ ] Cron idempotent: gọi 2 lần → lần 2 không đổi gì.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api test:e2e` xanh (đọc output thật, không tin "suite failed" giả do Kafka teardown treo).
- [ ] `pnpm --filter @erp/api lint` xanh.
- [ ] `openapi.snapshot.json` + `schema.ts` đã commit (TKT-DUE-05).
- [ ] `pnpm --filter @erp/pos-web build` xanh (TKT-DUE-06/07).
- [ ] Không TODO/FIXME ngoài kế hoạch; không Vietnamese trong BE source.

## Testing Strategy

- E2E chạy trên `erp_test` (`pnpm --filter @erp/api test:e2e`) với env DB tường minh; suite serial `maxWorkers:1`, `forceExit:true`.
- Round-trip: tạo invoice draft → add item → checkout với due date → GET debt → assert.

## Dependencies

- Depends on: TKT-DUE-02, TKT-DUE-03, TKT-DUE-04, TKT-DUE-06, TKT-DUE-07.
- Blocks: — (gate cuối).
