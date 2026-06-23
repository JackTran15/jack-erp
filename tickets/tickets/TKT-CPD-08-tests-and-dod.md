# TKT-CPD-08 Tests (3 loại) + DoD gate

## Epic

[EPIC-22062026 Hiển thị "Đối tượng" trên Nhập / Xuất / Chuyển kho](../epics/EPIC-22062026-counterparty-display-inventory-docs.md)

## Summary

Spec cho util resolve + 3 search handler, e2e cross-flow, và cổng DoD cho cả epic.

## Deliverables

- `counterparty-name.util.spec.ts` — `attachCounterparties` set đúng name/code cho supplier/customer/employee; `null` khi id rỗng/không tìm thấy; scope orgId; ≤ 1 query/kind (assert qua mock manager / count).
- `search-goods-receipts-v2.handler.spec.ts` — seed 1 phiếu/loại; assert `row.counterparty.name`; filter `dto.party` khớp đúng cả 3 loại.
- `search-goods-issues-v2.handler.spec.ts` — như trên + assert TRANSFER_OUT vẫn fallback `targetBranch.name`.
- `search-stock-transfers-v2.handler.spec.ts` — counterparty mới resolve; phiếu legacy (counterparty NULL, có transporter) fallback transporter.
- `stock-transfer.service.spec.ts` — create/update persist `counterpartyKind` + `counterpartyId`; `resolveDocCounterparty` reject đối tượng không thuộc org.
- (tùy chọn) e2e `apps/api/test/e2e/...` — tạo Nhập kho với customer → search → `counterparty.name` = tên khách hàng.

## Acceptance Criteria

- [ ] Tất cả spec cover happy path (3 loại) + edge: id không tồn tại, đối tượng cross-org bị reject, fallback (targetBranch / transporter).
- [ ] Không leak cross-tenant trong test (seed 2 org, assert chỉ thấy org của actor).

## Definition of Done (epic gate)

- [ ] `pnpm --filter @erp/api test` + `lint` xanh; `pnpm --filter @erp/api test:e2e` (nếu thêm e2e) xanh trên `erp_test`.
- [ ] FE `tsc` xanh.
- [ ] `pnpm openapi:generate` đã chạy + snapshot/schema commit (CPD-05).
- [ ] Verify trực quan repro Image #2: NK với khách hàng không còn `—`.
- [ ] Không Vietnamese trong source BE; không TODO/FIXME ngoài plan; `synchronize` false (chỉ 1 migration transfer).

## Tech Approach

- Mirror spec hiện có của các search-v2 handler (nếu repo đã có). Dùng `DataSource`/`EntityManager` thật trên DB test hoặc mock repo + manager tuỳ pattern sẵn có trong module.
- Với `attachCounterparties`: seed providers/customers/users theo org, gọi util, assert object inline.

## Dependencies

- Depends on: TKT-CPD-06, TKT-CPD-07 (và toàn bộ BE).
