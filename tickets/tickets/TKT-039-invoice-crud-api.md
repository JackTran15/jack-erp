# TKT-039 Invoice CRUD API (draft lifecycle)

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Xây dựng `InvoiceService` và `InvoiceController` cho các thao tác CRUD hóa đơn nháp: tạo mới, cập nhật dòng hàng, xem danh sách, xem chi tiết, xóa draft, liệt kê drafts theo session.

## Deliverables

- `modules/pos/services/invoice.service.ts`
- `modules/pos/dto/create-invoice.dto.ts`, `update-invoice.dto.ts`, `invoice-query.dto.ts`
- Endpoints mới trong `modules/pos/pos.controller.ts` (hoặc file controller riêng)
- `InvoiceModule` đăng ký entity + service (hoặc thêm vào `PosModule`)

## Implementation Status

✅ **COMPLETED** — 2026-05-07

Files delivered:
- `apps/api/src/modules/pos/services/invoice.service.ts`
- `apps/api/src/modules/pos/controllers/invoice.controller.ts`
- `apps/api/src/modules/pos/dto/create-invoice.dto.ts`
- `apps/api/src/modules/pos/dto/update-invoice.dto.ts`
- `apps/api/src/modules/pos/dto/invoice-query.dto.ts`
- `apps/api/src/modules/pos/dto/checkout-invoice.dto.ts`
- `apps/api/src/modules/pos/services/invoice.service.spec.ts` — 20 unit tests

## Acceptance Criteria

- [x] `POST /invoices` tạo draft (`is_draft=true`, `status=draft`); trả về invoice với `id` và `code`.
- [x] `PATCH /invoices/:id` cập nhật items (thêm/sửa/xóa dòng); chỉ cho phép khi `is_draft=true`.
- [x] `GET /invoices` list với filter: `status`, `date_from`, `date_to`, `customer_id`, `branch_id`; có phân trang.
- [x] `GET /invoices/:id` trả về invoice kèm `invoice_items[]`.
- [x] `DELETE /invoices/:id` chỉ xóa được khi `is_draft=true`.
- [x] `GET /invoices/drafts?session_id=xxx` chỉ trả draft thuộc session đó (không lộ draft của session khác).
- [x] Mọi query đều filter theo `organizationId` từ `ActorContext`.

## Definition of Done

- [x] PR có service + DTOs + controller; pass CI lint + build + unit tests.
- [x] Unit tests coverage: create draft, update items, delete draft, list với filter.
- [x] `is_draft=true` rows không xuất hiện trong `GET /invoices` khi filter `status=paid`.

## Tech Approach

### Endpoints

```
POST   /invoices                    Tạo draft mới
GET    /invoices                    List (filter: status, date, customer)
GET    /invoices/drafts             Drafts theo session_id
GET    /invoices/:id                Detail + items
PATCH  /invoices/:id                Update draft (items, customer, note)
DELETE /invoices/:id                Discard draft
```

### Price resolution khi thêm item vào draft

```
1. invoice.price_list_id → ProductPrice record (future)
2. items.selling_price (fallback hiện tại)
→ ghi vào invoice_items.unit_price (snapshot)
```

### Draft isolation

`GET /invoices/drafts` luôn filter `session_id = req.query.session_id AND is_draft = true`. Cashier A không thấy draft của cashier B.

### Guard

`@RequirePermission('pos.invoice.write')` cho POST/PATCH/DELETE.
`@RequirePermission('pos.invoice.read')` cho GET.

## Testing Strategy

- Unit: mock `InvoiceRepository`; test create/update/delete guard (chỉ draft).
- Integration: không required ở ticket này.

## Dependencies

- Requires: TKT-038 (entities).
- Blocks: TKT-040 (checkout), TKT-044 (purchase history).
