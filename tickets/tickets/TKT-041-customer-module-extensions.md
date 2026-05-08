# TKT-041 Customer module extensions + CustomerGroup

## Epic

[EPIC-007 POS Invoice, Customer Loyalty & Promotions](../epics/EPIC-007-pos-invoice-customer-promotions.md)

## Summary

Mở rộng `CustomerEntity` với các trường thông tin cá nhân còn thiếu và tạo entity `CustomerGroupEntity`. Cập nhật DTOs, service, và migration tương ứng.

## Deliverables

- 1 migration file: `1778100000000-ExtendCustomerAndAddCustomerGroup.ts`
- `CustomerGroupEntity` (`modules/customer/customer-group.entity.ts`)
- Cập nhật `CustomerEntity` với các cột mới
- Cập nhật `CreateCustomerDto`, `UpdateCustomerDto`
- CRUD endpoints cho `CustomerGroup`

## Implementation Status

⚠️ **PARTIALLY COMPLETED** — 2026-05-07

Files delivered:
- `apps/api/src/database/migrations/1778100000000-ExtendCustomerAndMembershipCard.ts`
- `apps/api/src/modules/customer/customer.entity.ts` — cập nhật fields mới + enum `Gender`
- `apps/api/src/modules/customer/customer-group.entity.ts`
- `apps/api/src/modules/customer/customer-group.service.ts`
- `apps/api/src/modules/customer/customer.controller.ts` — CRUD /customer-groups endpoints

**Chưa implement:**
- `customers.code` auto-generation trong service (cột tồn tại nhưng không tự gen khi POST)
- `assigned_staff_id` FK validation (chưa check user tồn tại trong cùng org)

## Acceptance Criteria

- [x] Migration thêm các cột vào `customers`: `code`, `birth_date`, `gender`, `national_id`, `group_id`, `assigned_staff_id`, `note` — không mất data hiện có.
- [x] Migration tạo bảng `customer_groups`.
- [ ] `customers.code` auto-generated (format `KH` + 6 số, unique per org) khi `POST /customers`. *(cột có nhưng không tự gen)*
- [x] `GET /customers/:id` trả về các trường mới.
- [x] `PATCH /customers/:id` update được `group_id`, `assigned_staff_id`, `note`, `birth_date`, `gender`.
- [x] CRUD `GET/POST/PATCH/DELETE /customer-groups` hoạt động.
- [ ] `assigned_staff_id` FK → `users` — validated tồn tại trong cùng org. *(chưa implement)*

## Definition of Done

- [x] PR có migration + entity cập nhật + DTOs + service; pass CI lint + build.
- [x] Rollback migration hoạt động (DROP TABLE customer_groups; DROP COLUMN các cột mới).
- [ ] Existing `CustomerEntity` tests không regression. *(chưa verify)*

## Tech Approach

### Cột thêm vào `customers`

| Column | Type | Default |
|---|---|---|
| `code` | varchar(10) | auto-gen, unique per org |
| `birth_date` | date | null |
| `gender` | enum `male\|female\|unspecified` | null |
| `national_id` | varchar(12) | null |
| `group_id` | uuid FK → customer_groups | null |
| `assigned_staff_id` | uuid FK → users | null |
| `note` | text | null |

### Auto-generate `code`

Dùng pattern tương tự DocumentNumberingModule hoặc DB sequence: `KH` + `LPAD(nextval, 6, '0')`. Implement trong `CustomerService.beforeCreate()`.

### `customer_groups` table

```
id               uuid PK
organization_id  uuid
name             varchar  unique per org
description      text nullable
created_at       timestamptz
updated_at       timestamptz
```

### Derived fields (không lưu — compute khi cần)

- `total_spent`: `SUM(invoices.subtotal) WHERE customer_id AND status != 'cancelled' AND is_draft = false`
- `invoice_count`: `COUNT(invoices) WHERE customer_id AND is_draft = false`
- `total_debt`: `SUM(invoice_debts.remaining_amount) WHERE customer_id AND status = 'open'`

Trả về trong `GET /customers/:id` nếu client request `?include=stats`.

## Testing Strategy

- Unit: test auto-gen code uniqueness, FK validation `assigned_staff_id`.
- Migration: staging snapshot trước/sau.

## Dependencies

- Requires: TKT-008 (CustomerModule foundation).
- Blocks: TKT-042 (MembershipCard — cần `customer_id` ổn định).
