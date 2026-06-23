# Backoffice Dynamic Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Do not commit, push, create branches, or run migrations.

**Goal:** Chuyển 10 backoffice list page còn lọc dữ liệu trên FE sang CQRS server-side Dynamic Search để tìm được record trên toàn bộ dataset.

**Architecture:** Mỗi list có endpoint versioned `POST /v2/<entity>/search`, request DTO ghép từ shared filter DTO, QueryBus dispatch đến QueryHandler dùng `FilterBuilder` và tenant scope. Generic CRUD pages được bật qua `CRUD_V2_SEARCH`; bespoke pages dùng TanStack Query hook riêng.

**Tech Stack:** NestJS CQRS, TypeORM, class-validator, React, TanStack Query, `erpApi`, `BaseDataTable`.

---

## Summary

Mỗi filter phải query toàn bộ dataset trong DB, trả đúng `{ data, total, page, limit }`, reset về page 1 khi filter đổi và debounce khoảng 300ms.

Giữ nguyên các endpoint GET và mutation hiện tại. Không migration, không schema change, không commit/push tự động.

## API Contracts

Thêm các endpoint:

| Endpoint | Scope | Filter chính |
|---|---|---|
| `POST /v2/inventory-item-units/search` | organization | `name`, `description`, `isActive` |
| `POST /v2/inventory-stock-balances/search` | organization + branch | item/product text fields, IDs, `quantity`, `lastMovementAt` |
| `POST /v2/payables/search` | organization | document/vendor/currency, amount, settledAmount, dueDate, status |
| `POST /v2/receivables/search` | organization | document/currency, amount, settledAmount, dueDate, status |
| `POST /v2/expenses/search` | organization | description, amount, status |
| `POST /v2/branches/search` | organization | name, address, status |
| `POST /v2/provider-groups/search` | organization | code, name, description, isActive |
| `POST /v2/roles/search` | organization | name, description |
| `POST /v2/cash-vouchers/search` | organization + active branch/cash account | date, document number/type, amount, counterparty, reason |
| `POST /v2/cash-counts/search` | organization + cash account | count dates, document number, purpose, status |

Quy tắc chung:

- DTO ghép từ `StringFilterDto`, `CompareFilterDto`, `DateRangeFilterDto`, `EnumFilterDto`.
- Handler dùng `FilterBuilder`, scope tenant trước khi áp filter.
- Sort mặc định giữ giống page hiện tại.
- Row shape phải giữ tương thích với dữ liệu FE đang render.
- Relation/ID columns không có UI filter hợp lệ tiếp tục hiển thị nhưng đặt `filterKind: "none"`.

Ngoại lệ Nhóm NCC:

- Giữ dạng cây, không paginate làm gãy hierarchy.
- BE tìm node khớp filter và trả thêm toàn bộ ancestors.
- Response vẫn dùng envelope chuẩn với `page: 1`; `total` là số node thực sự khớp, không tính ancestor bổ sung.

Thu/chi tiền mặt:

- Dùng một endpoint hợp nhất `cash_receipts` và `cash_payments`.
- Query bằng `UNION ALL`/subquery, sau đó áp filter, sort và pagination trên tập hợp chung.
- Trả row tương thích `ReceiptPaymentListItem`, gồm `kind`, `id`, document fields, counterparty, reference metadata để detail flow không đổi.

## Implementation Phases

### Phase 1: Backend CQRS handlers

Tạo DTO, Query, Handler và focused handler spec cho từng domain.

- Mở rộng `AdminSearchModule` cho units, stock balances, payables, receivables, expenses, branches, provider groups và roles.
- Stock balance phải giữ flattened row hiện tại; extract/reuse mapper thay vì tạo shape khác.
- Provider groups dùng DB search + ancestor resolution.
- Roles giữ đúng `RoleSummary` mapper hiện tại.
- Thêm controller/query handlers riêng trong `CashVouchersModule` cho unified cash vouchers và cash counts.
- Existing GET list endpoints giữ nguyên byte-compatible.

### Phase 2: Backend integration và OpenAPI

- Wire toàn bộ handler vào module/controller tương ứng.
- Thêm permission guard bằng permission đọc hiện có, không seed permission mới.
- Chạy API rồi chạy `pnpm openapi:generate`.
- Không hand-edit generated schema.

### Phase 3: Generic CRUD FE wiring

Thêm registry entries vào `CRUD_V2_SEARCH` cho:

- `inventory-item-units`
- `inventory-stock-balances`
- `payables`
- `receivables`
- `expenses`
- `branches`

`CrudListPage` tự chuyển sang POST v2, server pagination và bỏ client-side filtering cho các entity này.

### Phase 4: Bespoke FE wiring

- **Nhóm NCC:** thêm filter mã/tên/mô tả/trạng thái, debounce, gọi v2 endpoint, dựng cây từ response có ancestors.
- **Vai trò:** thay `useRoles()` list bằng `useRoleSearch(body)`, bỏ `filteredRoles`, thêm server pagination.
- **Thu/chi tiền mặt:** thay hai request + FE merge bằng unified search hook; bỏ `filteredRows` và `slice`.
- **Kiểm kê tiền mặt:** thay GET list + FE filtering bằng search hook; map `UNPROCESSED -> DRAFT`, `PROCESSED -> POSTED`.

## Subagent Execution Plan

Triển khai theo hai wave để tránh nhiều agent sửa cùng shared files.

**Wave 1, chạy song song:**

1. Agent Admin Master Data: units, branches, provider groups, roles DTO/query/handler/spec.
2. Agent Accounting Lists: payables, receivables, expenses DTO/query/handler/spec.
3. Agent Stock Balance: endpoint, flattened mapper parity và specs.
4. Agent Unified Cash Vouchers: union search endpoint và specs.
5. Agent Cash Counts: search endpoint và specs.

Mỗi agent chỉ tạo domain files; không sửa shared controller/module, không codegen.

**Integration checkpoint, main agent:**

- Review tenant scoping và row-shape parity.
- Wire shared controllers/modules.
- Chạy focused API tests.
- Regenerate OpenAPI một lần.

**Wave 2, chạy song song:**

1. Agent Generic FE: sáu `CRUD_V2_SEARCH` entries và build verification.
2. Agent Provider Groups + Roles FE: hai bespoke pages và hooks.
3. Agent Treasury FE: unified cash vouchers + cash counts wiring.

Main agent review integration, xử lý conflicts và chạy full verification.

## Test Plan

Backend handler specs phải cover:

- Organization/branch isolation.
- Mỗi filter operator quan trọng: contains, equals, date range, compare, enum/boolean.
- Pagination và `total` sau filter.
- Row shape parity.
- Provider group trả matching nodes cùng ancestors.
- Cash voucher union sort/pagination đúng trên cả receipt và payment.
- Không trả dữ liệu tenant/branch khác.

Verification:

```bash
pnpm --filter @erp/api test
pnpm --filter @erp/api build
pnpm --filter @erp/backoffice-web build
pnpm contract:check
```

Manual acceptance:

- Tạo record nằm ở page 2 hoặc 3.
- Đứng page 1, nhập filter khớp record đó.
- Xác nhận request là `POST /v2/.../search`, record xuất hiện và total/pagination đúng.
- Xác nhận create/edit/delete/detail flows không thay đổi.

## Assumptions

- Chỉ triển khai 10 page hiện đang lọc client-side; các report/page đã filter server-side bằng GET nằm ngoài scope.
- Không thêm sorting API mới ngoài sort mặc định hiện tại.
- Không thay đổi database hoặc chạy migration.
- UI copy mới dùng tiếng Việt; identifiers, enum và API fields giữ English.
