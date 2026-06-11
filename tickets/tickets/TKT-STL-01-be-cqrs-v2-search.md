# TKT-STL-01 BE: CQRS v2 search cho danh sách Chuyển kho

## Epic

[EPIC-09062026 Danh sách Chuyển kho theo mẫu mShopKeeper](../epics/EPIC-09062026-stock-transfer-list-v2.md)

## Layer

🟦 Backend only (CQRS read endpoint).

## Summary

Thêm endpoint **`POST /v2/inventory/stock/transfers/search`** theo skill `cqrs-search-endpoint`, mirror `goods-issue` v2 stack. Đẩy filter theo từng cột xuống backend (query toàn bộ dataset + phân trang), scope `organizationId` + `branchId`, trả mỗi row kèm `transporter` inline, `totalAmount` (∑ `line_value`), và `lines` cho panel Chi tiết.

## Deliverables

- `apps/api/src/modules/inventory/transfer/dto/stock-transfer-search-v2.dto.ts` — request DTO mirror `goods-issue-search-v2.dto.ts`: `page`, `limit`, filter sub-DTO theo cột:
  - `transferredAt` / `createdAt` (date-range filter),
  - `documentNumber` (string contains/equals),
  - `transporter` (string contains — lọc theo tên Người vận chuyển),
  - `totalAmount` (numeric compare `≤`/`=`),
  - `notes` (string contains).
- `apps/api/src/modules/inventory/transfer/queries/search-stock-transfers-v2.query.ts` — Query object `{ filters, actor }`.
- `apps/api/src/modules/inventory/transfer/queries/search-stock-transfers-v2.handler.ts` — `@QueryHandler`:
  - Base `where`: `organizationId = actor.organizationId`, `branchId = actor.branchId`, `status != CANCELLED` (ẩn phiếu đã Xóa).
  - Áp `FilterBuilder` cho từng cột; join `users` để filter + inline `transporter { id, fullName }`.
  - **Tổng tiền**: per-row `totalAmount = ∑ line_value`. Filter `totalAmount` dùng **SQL SUM subquery** (filter-only); row vẫn trả đủ `lines` (xem [[reference_branchid_varchar_and_typeorm_cast]] precedent). `totalAmount` tính/đính kèm mỗi row.
  - **Embed `lines` đầy đủ trên mỗi row** (item code/name/unit, `sourceStorage`/`destinationStorage`, `sourceLocation`/`destinationLocation`, `unitPrice`, `lineValue`, `notes`) để panel "Chi tiết" FE render khi click dòng **mà không cần gọi thêm API** — mirror response của `goods-issue` search (`DetailPanel` đọc `row.lines`). Eager relations trên `StockTransferLineEntity` đã có sẵn từ epic trước.
  - Trả envelope `{ data, total, page, pageSize }`; sort mặc định `transferred_at`/`created_at` DESC.
- `apps/api/src/modules/inventory/transfer/controllers/stock-transfer-v2.controller.ts` — `@Controller()` + `@Version('2')` (hoặc path `v2/...` theo convention goods-issue), `@UseGuards(AuthGuard, PermissionGuard, BranchScopeGuard)`, `@RequirePermission('inventory.transfer.read')`, `@RequireBranchScope()`, dispatch qua `QueryBus`.
- `stock-transfer.module.ts` — import `CqrsModule`, register handler; thêm `UserEntity` (đã có ở epic trước) cho join.

## Acceptance Criteria

- [ ] `POST /v2/inventory/stock/transfers/search` lọc đúng từng cột (date-range, contains, compare) trên toàn dataset; phân trang server-side.
- [ ] Scope `organizationId` + `branchId`; không rò rỉ chéo tenant/chi nhánh; ẩn `status = CANCELLED`.
- [ ] Mỗi row có `transporter` inline, `totalAmount` (∑ line_value), `lines` (đủ kho/vị trí/đơn giá/thành tiền).
- [ ] Filter `Tổng tiền ≤ X` chạy bằng SUM subquery; row vẫn giữ nguyên `lines`.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` pass; Swagger `/docs` hiện DTO v2.
- [ ] Handler spec (TKT-STL-05) xanh.
- [ ] Source/Swagger tiếng Anh.

## Tech Approach

- Mirror `search-goods-issues-v2.handler.ts` 1:1 cho cấu trúc QueryBus + FilterBuilder.
- Aggregate Tổng tiền: ưu tiên tính trên RAM từ `lines` đã eager khi chỉ để hiển thị; chỉ dùng SUM subquery khi cần **filter** theo Tổng tiền (xem [[feedback_prefer_in_memory_aggregation]]).
- Inline transporter theo lô (1 query users) — không trả root map (xem [[feedback_inline_relations_over_root_map]]).

## Dependencies

- Requires: EPIC-09062026 (transporter/line_value đã có).
- Blocks: TKT-STL-03, TKT-STL-05.
