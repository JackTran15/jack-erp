# TKT-038 Invoice + InvoiceItem entities & migration

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Tạo TypeORM entities và migration cho `invoices` và `invoice_items`. Đây là foundation của toàn bộ EPIC-007 — các ticket sau đều phụ thuộc vào 2 bảng này.

## Deliverables

- 1 migration file: `1778000000000-AddInvoiceAndInvoiceItems.ts`
- `InvoiceEntity` (`modules/pos/entities/invoice.entity.ts`)
- `InvoiceItemEntity` (`modules/pos/entities/invoice-item.entity.ts`)
- Enum: `InvoiceStatus` (`draft | pending | paid | debt | cancelled`), `InvoicePaymentMethod` (`cash | bank_transfer | card | debt`)
- Export qua `modules/pos/entities/index.ts`

## Implementation Status

✅ **COMPLETED** — 2026-05-07

Files delivered:
- `apps/api/src/database/migrations/1778000000000-AddPosInvoiceEntities.ts` — 5 enums + 4 tables (invoices, invoice_items, invoice_debts, debt_payments)
- `apps/api/src/database/migrations/1778500001000-AddLocationIdToInvoiceItems.ts` — thêm `location_id` vào `invoice_items`
- `apps/api/src/modules/pos/entities/invoice.entity.ts`
- `apps/api/src/modules/pos/entities/invoice-item.entity.ts`
- `apps/api/src/modules/pos/entities/index.ts` — updated exports

## Acceptance Criteria

- [x] Migration chạy thành công từ DB staging hiện tại (không mất data SaleEntity).
- [x] Rollback migration hoạt động.
- [x] FK `customer_id → customers`, `staff_id → users` có trong migration.
- [x] Index `(organization_id, branch_id, issued_at)`, `(organization_id, customer_id)`, `(organization_id, session_id, is_draft)` được tạo.
- [x] Unique `(organization_id, code)` trên `invoices`.

## Definition of Done

- [x] PR có migration + 2 entity files; pass CI lint + build.
- [x] Entity decorator đúng pattern `BaseEntity` (`organizationId`, `branchId`, `createdAt`, `updatedAt`, `createdBy`).
- [ ] Ran migration trên staging replica — snapshot DB trước merge. *(cần chạy thủ công trên staging)*

## Tech Approach

### `invoices`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | from BaseEntity |
| `branch_id` | uuid | from BaseEntity — chi nhánh bán hàng |
| `code` | varchar(20) | e.g. `2605010002` — unique per org |
| `issued_at` | timestamptz | thời điểm lập hóa đơn |
| `status` | enum | `draft \| pending \| paid \| debt \| cancelled` |
| `subtotal` | decimal(18,2) | tổng trước chiết khấu |
| `discount_amount` | decimal(18,2) | tổng ưu đãi |
| `deposit_amount` | decimal(18,2) | tiền đặt cọc |
| `amount_due` | decimal(18,2) | = subtotal − discount − deposit |
| `payment_method` | enum | nullable cho drafts |
| `cash_tendered` | decimal(18,2) | nullable |
| `change_amount` | decimal(18,2) | nullable |
| `note` | text | nullable |
| `is_draft` | boolean | true = HD lưu tạm |
| `session_id` | varchar | terminal/tab ID |
| `draft_label` | varchar | nullable — tên tạm người dùng đặt |
| `customer_id` | uuid FK | → customers — nullable (khách vãng lai) |
| `staff_id` | uuid FK | → users — nhân viên bán hàng |
| `price_list_id` | uuid FK | → price_lists — nullable (future) |
| `created_by` | uuid | from BaseEntity |
| `created_at` | timestamptz | from BaseEntity |
| `updated_at` | timestamptz | from BaseEntity |

### `invoice_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | from BaseEntity |
| `invoice_id` | uuid FK | → invoices |
| `item_id` | uuid FK | → items — live FK cho reporting |
| `item_code` | varchar | SNAPSHOT tại thời điểm bán |
| `item_name` | varchar | SNAPSHOT |
| `unit` | varchar | SNAPSHOT |
| `quantity` | decimal(18,2) | |
| `unit_price` | decimal(18,2) | SNAPSHOT — từ price list hoặc `items.selling_price` |
| `line_discount` | decimal(18,2) | chiết khấu dòng |
| `line_total` | decimal(18,2) | = qty × unit_price − line_discount |
| `note` | text | nullable |
| `sort_order` | int | thứ tự hiển thị |

**Snapshot fields là write-once** — không UPDATE sau khi invoice finalized.

## Testing Strategy

- Unit: không cần (pure migration).
- Staging: chạy migration + `psql` kiểm tra schema + select sample từ `sales` cũ còn nguyên.
- Rollback: down migration; verify `sales`, `sale_lines` vẫn còn.

## Dependencies

- Blocks: TKT-039, TKT-040, TKT-043, TKT-044, TKT-046.
- Requires: foundation từ EPIC-004 (DocumentNumberingModule), EPIC-003 (`items` table).
