# TKT-DIS-01 v2 inventory-items search — default-hide discontinued + includeInactive override

## Epic

[EPIC-10072026 Hide Discontinued Products From Search & Catalog](../epics/EPIC-10072026-hide-discontinued-products.md)

## Summary

`POST /v2/inventory-items/search` hiện chỉ lọc `isActive` khi caller truyền tường minh (`applyBool`), nên hàng ngừng kinh doanh vẫn lọt vào kết quả. Ticket này thêm cờ `includeInactive` vào DTO và ép mặc định `combined."isActive" = true` trong handler trừ khi `includeInactive=true`. Đây là gap chính của epic.

## Deliverables

- `apps/api/src/modules/inventory/location/dto/inventory-item-search-v2.dto.ts` — thêm field optional `includeInactive?: boolean` (`@ApiPropertyOptional`, `@IsOptional`, `@IsBoolean`). DTO khai báo mọi field vì `whitelist: true`.
- `apps/api/src/modules/inventory/location/queries/search-inventory-items-v2.handler.ts` — sau khi apply các filter, nếu `dto.includeInactive !== true` thì push predicate `combined."isActive" = true` (dùng đúng cột đã có trong CTE, không tham số hoá vì là literal cố định).

## Acceptance Criteria

- [ ] Mọi query vẫn scope `actor.organizationId` (không đổi — `$1` = orgId trong CTE); không leak cross-tenant.
- [ ] Không truyền `includeInactive` → kết quả **không** chứa group/orphan có `isActive=false`.
- [ ] `includeInactive=true` → không ép `isActive`; nếu đồng thời truyền filter `isActive=false` thì chỉ trả hàng inactive (dùng cho màn xem riêng ngừng kinh doanh).
- [ ] Filter `isActive=true` khi `includeInactive` không set: kết quả không đổi so với hành vi mặc định (redundant nhưng hợp lệ).
- [ ] `total` (countSql) và `data` (dataSql) áp dụng **cùng** whereSql → đếm khớp trang.
- [ ] Mutations vẫn idempotent (endpoint read-only, không đổi interceptor).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: default-hide, `includeInactive=true` show all, `includeInactive=true` + `isActive=false` chỉ inactive.
- [ ] Không đụng `synchronize` / migration.
- [ ] Không có tiếng Việt trong backend source (chỉ ticket prose).
- [ ] Endpoint đổi → openapi regen ở TKT-DIS-03.

## Tech Approach

DTO:

```ts
/** Bao gồm cả hàng ngừng kinh doanh (isActive=false). Mặc định ẩn. */
@ApiPropertyOptional({ default: false })
@IsOptional()
@IsBoolean()
includeInactive?: boolean;
```

Handler — chèn ngay sau các `applyBool(...)` hiện có (L106-107), trước khi build `whereSql`:

```ts
this.applyBool(where, params, '"isPosVisible"', dto.isPosVisible);
this.applyBool(where, params, '"isActive"', dto.isActive);

// Default-hide discontinued items unless the caller opts in.
if (dto.includeInactive !== true) {
  where.push('"isActive" = true');
}
```

Lưu ý: `"isActive"` trong CTE là `bool_and(i.is_active)` cho group và `i.is_active` cho orphan, nên predicate literal này đúng cho cả hai nhánh. Không cần thêm param (`params` không đổi → offset `LIMIT/OFFSET` giữ nguyên).

## Testing Strategy

- Unit (`search-inventory-items-v2.handler.spec.ts` — tạo mới nếu chưa có, hoặc bổ sung): mock `repo.manager.query`, assert `whereSql` chứa `"isActive" = true` khi không truyền cờ, và **không** chứa khi `includeInactive=true`. Nếu đã có e2e cho endpoint, thêm case seed 1 item active + 1 inactive → default trả 1, `includeInactive=true` trả 2.

## Dependencies

- Depends on: —
- Blocks: TKT-DIS-03 (openapi/FE), TKT-DIS-04 (tests/DoD).
