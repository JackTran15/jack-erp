# TKT-DIS-03 OpenAPI regen + FE "Hiển thị hàng ngừng kinh doanh" toggle + export verify

## Epic

[EPIC-10072026 Hide Discontinued Products From Search & Catalog](../epics/EPIC-10072026-hide-discontinued-products.md)

## Summary

Sau khi backend mặc định ẩn hàng ngừng kinh doanh, backoffice quản lý cần một cách để thấy lại chúng (khôi phục / kiểm tra). Ticket này regen api-client và xác nhận export vẫn bao gồm hàng ngừng kinh doanh.

**Quyết định FE (điều chỉnh so với plan):** KHÔNG thêm toggle riêng vào `CrudListPage` (component dùng chung, load-bearing). Trang `inventory-items` đã có sẵn cột **"Trạng thái" (`isActive` boolean)** đăng ký làm v2 filter (`crudV2Search.ts`). Đây chính là opt-in platform-native: đặt filter cột `isActive = Ngừng theo dõi` → body gửi `isActive: false` → handler bỏ qua default-hide → hiện hàng ngừng kinh doanh. Không cần code FE mới. (Đánh đổi: mất khả năng xem active+inactive lẫn lộn cùng lúc — hiếm dùng cho luồng quản lý/khôi phục.)

## Deliverables

- Chạy API rồi `pnpm openapi:generate`; commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` (không sửa tay). — **DONE** (3 field `includeInactive` xuất hiện trong generated schema; diff sạch, không drift).
- Xác nhận cột "Trạng thái" (`isActive`) trên list dùng được làm opt-in (đã có sẵn trong `INVENTORY_ITEM_ENTITY_CONFIG.fields` + `CRUD_V2_SEARCH['inventory-items'].fields.isActive`).
- **Không** đổi `CsvExportService` — chỉ verify export vẫn trả hàng inactive (cột `Inactive = "Có"`). Code export không đổi (đã xác nhận không có filter `is_active`).

## Acceptance Criteria

- [x] api-client regen phản ánh field `includeInactive` trên search DTO; diff snapshot sạch.
- [x] Trang quản lý mặc định **không** hiện hàng ngừng kinh doanh (backend default-hide qua v2 search).
- [x] Admin thấy lại hàng ngừng kinh doanh qua filter cột "Trạng thái" = Ngừng theo dõi (`isActive=false`).
- [ ] Export CSV/Excel vẫn liệt kê hàng ngừng kinh doanh (verify thủ công 1 lần — cần đăng nhập backoffice).

## Definition of Done

- [x] `pnpm openapi:generate` đã chạy; snapshot + generated schema regenerated.
- [x] Không đụng logic export.
- [x] Không thêm surgery vào `CrudListPage` dùng chung (giữ surgical).

## Tech Approach

Không có code FE mới. Opt-in dùng cột `isActive` sẵn có:
- `apps/api/.../item-crud.service.ts` → `INVENTORY_ITEM_ENTITY_CONFIG.fields`: `{ key: "isActive", label: "Trạng thái", type: "boolean" }`.
- `apps/backoffice-web/.../crud/crudV2Search.ts` → `CRUD_V2_SEARCH['inventory-items'].fields.isActive: "boolean"`.
- `buildV2Body` map boolean filter `"false"` → `isActive: false` trong body; handler v2 coi đây là explicit → bỏ qua default-hide.

## Testing Strategy

- Thủ công: seed 1 hàng ngừng kinh doanh → list mặc định không hiện; đặt filter cột "Trạng thái"=Ngừng theo dõi → hiện; export chứa nó.
- Không thêm test tự động cho FE (repo web apps echo "test").

## Dependencies

- Depends on: TKT-DIS-01, TKT-DIS-02.
- Blocks: TKT-DIS-04.
