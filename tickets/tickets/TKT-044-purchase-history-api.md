# TKT-044 Purchase history API (lịch sử mua hàng)

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Xây dựng API tra cứu lịch sử mua hàng của khách hàng. Không cần entity mới — query trên `invoices` + `invoice_items` đã có.

## Deliverables

- Endpoints mới trong CustomerController (hoặc InvoiceController)
- `CustomerPurchaseHistoryQueryDto`
- Response DTO: `PurchaseHistorySummaryDto`, `PurchaseHistoryDetailDto`

## Implementation Status

❌ **NOT IMPLEMENTED** — 2026-05-07

Ticket này chưa được implement. Không có endpoint `GET /customers/:id/invoices` trong codebase.

**Việc cần làm:**
- Thêm endpoint `GET /customers/:id/invoices` vào `CustomerController` (hoặc `InvoiceController`)
- Thêm endpoint `GET /customers/:id/invoices/:invoiceId`
- Viết `CustomerPurchaseHistoryService` hoặc extend `InvoiceService`
- Viết `CustomerPurchaseHistoryQueryDto`
- Unit tests

## Acceptance Criteria

- [ ] `GET /customers/:id/invoices` trả danh sách invoice của khách (tất cả chi nhánh — không filter branch).
- [ ] Hỗ trợ filter: `date_from`, `date_to`, `status`, `branch_id` (optional), `page`, `limit`.
- [ ] Mỗi row trả về: `code`, `issued_at`, `branch_id`, `branch_name`, `subtotal`, `discount_amount`, `amount_due`, `payment_method`, `status`.
- [ ] `GET /customers/:id/invoices/:invoiceId` trả detail kèm `invoice_items[]`.
- [ ] Detail items dùng **snapshot fields** (`item_code`, `item_name`, `unit`, `unit_price`) — không JOIN sang `items` để tránh lệch lịch sử.
- [ ] `is_draft=true` invoices không xuất hiện trong lịch sử.
- [ ] Nếu `customer_id` không thuộc org → 404.

## Definition of Done

- [ ] PR có endpoints + DTOs; pass CI lint + build + unit tests.
- [ ] Unit test: list trả đúng filter, không lộ draft, không lộ invoice của customer khác.
- [ ] Response có đúng snapshot fields ở detail.

## Tech Approach

### Endpoints

```
GET /customers/:id/invoices                List purchase history
GET /customers/:id/invoices/:invoiceId     Detail với invoice_items
```

### Query

```sql
SELECT i.*, b.name AS branch_name
FROM invoices i
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.customer_id = :customerId
  AND i.organization_id = :orgId
  AND i.is_draft = false
  AND i.status != 'cancelled'   -- hoặc tuỳ filter
ORDER BY i.issued_at DESC
LIMIT :limit OFFSET :offset
```

### Derived stats (trả kèm trong response customer nếu `?include=stats`)

```json
{
  "totalSpent": 15000000,
  "invoiceCount": 12,
  "totalDebt": 500000
}
```

Tính bằng subquery — không lưu vào DB.

## Testing Strategy

- Unit: mock `InvoiceRepository`; test filter `is_draft=false`, cross-branch (không filter branch), customer không thuộc org → 404.

## Dependencies

- Requires: TKT-038 (InvoiceEntity), TKT-039 (Invoice CRUD — cần hiểu cấu trúc response), TKT-041 (CustomerEntity).
- Blocks: (none).
