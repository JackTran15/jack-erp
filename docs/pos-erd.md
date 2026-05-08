# POS Entity Design — ERD

> Entities for the Point-of-Sale domain in `apps/api/src/modules/pos/` and related modules.
> All entities extend `BaseEntity` which provides `id (UUID PK)`, `organizationId`, `branchId?`, `createdAt`, `updatedAt`, `createdBy` unless noted otherwise.

---

## Table of Contents

1. [Existing Entities (reference)](#1-existing-entities-reference)
2. [Invoice + InvoiceItem](#2-invoice--invoiceitem)
3. [Customer Extensions](#3-customer-extensions)
4. [MembershipCard + PointHistory](#4-membershipcard--pointhistory)
5. [InvoiceDebt + DebtPayment](#5-invoicedebt--debtpayment)
6. [Promotions](#6-promotions)
7. [Relationship Map](#7-relationship-map)
8. [Cardinalities](#8-cardinalities)
9. [Lifecycle States](#9-lifecycle-states)

---

## 1. Existing Entities (reference)

Referenced as FK targets — do not modify.

### `customers` (`modules/customer/customer.entity.ts`)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `name` | varchar | |
| `email` | varchar | nullable, unique per org |
| `phone` | varchar | nullable, unique per org |
| `address` | text | nullable |
| `status` | enum | `active` \| `inactive` \| `merged` |
| `merged_into_id` | uuid FK | → customers (self) |

### `items` (`modules/inventory/location/item.entity.ts`)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `code` | varchar | unique per org (SKU) |
| `name` | varchar | |
| `unit` | varchar | |
| `selling_price` | decimal(18,2) | Default fallback price |
| `is_active` | boolean | |

### `branches` (`modules/branch/branch.entity.ts`)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `name` | varchar | |

### `users` (`modules/auth/user.entity.ts`)
Replaces the "Staff" concept — all `staff_id` FKs point here.
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `email` | varchar | |
| `first_name` | varchar | |
| `last_name` | varchar | |
| `is_active` | boolean | |

---

## 2. Invoice + InvoiceItem

### `invoices` (`modules/pos/entities/invoice.entity.ts`) — NEW

Full lifecycle invoice: draft → paid | debt | cancelled.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | from BaseEntity |
| `branch_id` | uuid | from BaseEntity |
| `code` | varchar(20) | e.g. `2605010002` — `YYMMdd + seq`. Via DocumentNumberingModule |
| `issued_at` | timestamptz | Date + time of sale |
| `status` | enum | `draft` \| `pending` \| `paid` \| `debt` \| `cancelled` |
| `subtotal` | decimal(18,2) | Sum of all `invoice_items.line_total` |
| `discount_amount` | decimal(18,2) | Total promotion / code discount |
| `deposit_amount` | decimal(18,2) | Deposit paid upfront |
| `amount_due` | decimal(18,2) | = subtotal − discount − deposit |
| `payment_method` | enum | `cash` \| `bank_transfer` \| `card` \| `debt` — nullable for drafts |
| `cash_tendered` | decimal(18,2) | nullable |
| `change_amount` | decimal(18,2) | = cash_tendered − amount_due — nullable |
| `note` | text | nullable |
| `is_draft` | boolean | `true` = parked draft (HD lưu tạm) |
| `session_id` | varchar | Terminal/tab ID — isolates drafts per cashier |
| `draft_label` | varchar | nullable — user-given name for the draft |
| `customer_id` | uuid FK | → customers — nullable (walk-in allowed) |
| `staff_id` | uuid FK | → users |
| `price_list_id` | uuid FK | → price_lists — nullable (future) |
| `created_by` | uuid | from BaseEntity |
| `created_at` | timestamptz | from BaseEntity |
| `updated_at` | timestamptz | from BaseEntity |

**Indexes:**
- `(organization_id, branch_id, issued_at)`
- `(organization_id, customer_id)` — for purchase history
- `(organization_id, session_id, is_draft)` — draft isolation
- `(organization_id, code)` UNIQUE

**Business rules:**
- `is_draft = true` rows are excluded from all revenue reports.
- Only `is_draft = true` invoices can be `DELETE`d.
- `code` uniqueness is scoped to `(branch_id, date)` — use DocumentNumberingModule sequence.

---

### `invoice_items` (`modules/pos/entities/invoice-item.entity.ts`) — NEW

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | from BaseEntity |
| `invoice_id` | uuid FK | → invoices |
| `item_id` | uuid FK | → items — live FK for reporting |
| `item_code` | varchar | **SNAPSHOT** of `items.code` at sale time |
| `item_name` | varchar | **SNAPSHOT** of `items.name` at sale time |
| `unit` | varchar | **SNAPSHOT** of `items.unit` at sale time |
| `quantity` | decimal(18,2) | |
| `unit_price` | decimal(18,2) | **SNAPSHOT** — resolved from price list or `items.selling_price` |
| `line_discount` | decimal(18,2) | Line-level discount amount |
| `line_total` | decimal(18,2) | = quantity × unit_price − line_discount |
| `note` | text | nullable |
| `sort_order` | int | Display ordering |

**Price resolution at INSERT:**
```
1. PriceList → ProductPrice  (if invoice.price_list_id set + item has an entry)
2. items.selling_price        (fallback)
→ copy resolved price into invoice_items.unit_price
```

**Snapshot fields are write-once** — never UPDATE after invoice is finalized.

---

## 3. Customer Extensions

### `customers` — MODIFIED fields to add

| Field | Type | Notes |
|---|---|---|
| `code` | varchar(10) | e.g. `KH000017` — unique per org, auto-generated |
| `birth_date` | date | nullable |
| `gender` | enum | `male` \| `female` \| `unspecified` — nullable |
| `national_id` | varchar(12) | CCCD — nullable |
| `group_id` | uuid FK | → customer_groups — nullable |
| `assigned_staff_id` | uuid FK | → users — nullable |
| `note` | text | nullable |

**No `branch_id`** — customers are org-wide (shared across all branches).

**Derived fields (compute at query time — never store):**

| Derived | Query |
|---|---|
| `total_spent` | `SUM(invoices.subtotal) WHERE customer_id AND status != cancelled AND is_draft = false` |
| `invoice_count` | `COUNT(invoices) WHERE customer_id AND is_draft = false` |
| `total_debt` | `SUM(invoice_debts.remaining_amount) WHERE customer_id AND status = open` |

---

### `customer_groups` (`modules/customer/customer-group.entity.ts`) — NEW

Simple lookup table.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `name` | varchar | unique per org |
| `description` | text | nullable |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## 4. MembershipCard + PointHistory

### `membership_cards` (`modules/customer/membership-card.entity.ts`) — NEW

1:1 with Customer.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | from BaseEntity (no branch_id — org-wide) |
| `customer_id` | uuid FK | → customers (1:1 UNIQUE) |
| `card_number` | varchar | unique per org |
| `tier` | enum | `none` \| `silver` \| `gold` \| `diamond` |
| `points` | int | Running total — denormalized, always updated atomically with `point_history` |
| `issued_at` | date | |
| `expires_at` | date | nullable |
| `lomas_card_number` | varchar | nullable — external Lomas system ref (plain VARCHAR, no FK) |
| `lomas_tier` | varchar | nullable — external Lomas tier label (plain VARCHAR, no FK) |
| `is_active` | boolean | |
| `created_at` | timestamptz | from BaseEntity |
| `updated_at` | timestamptz | from BaseEntity |

**Business rule:** UPDATE `points` + INSERT `point_history` must be in a single DB transaction.

---

### `point_history` (`modules/customer/point-history.entity.ts`) — NEW

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `card_id` | uuid FK | → membership_cards |
| `invoice_id` | uuid FK | → invoices — nullable (manual adjustments have no invoice) |
| `type` | enum | `earn` \| `redeem` \| `adjust` |
| `delta` | int | Points change — positive (earn) or negative (redeem) |
| `note` | text | nullable |
| `created_at` | timestamptz | |
| `created_by` | uuid | Who made the adjustment |

---

## 5. InvoiceDebt + DebtPayment

### `invoice_debts` (`modules/pos/entities/invoice-debt.entity.ts`) — NEW

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | from BaseEntity |
| `branch_id` | uuid | from BaseEntity — debt scoped to branch |
| `reference_code` | varchar | mirrors `invoices.code` for display |
| `invoice_id` | uuid FK | → invoices (1:1) |
| `customer_id` | uuid FK | → customers — REQUIRED (no walk-in debt) |
| `document_type` | enum | `credit_invoice` \| `payment_receipt` \| `adjustment` |
| `original_amount` | decimal(18,2) | = `invoices.amount_due` at debt creation time |
| `paid_amount` | decimal(18,2) | Cumulative payments received |
| `remaining_amount` | decimal(18,2) | = original_amount − paid_amount |
| `issued_at` | date | |
| `due_date` | date | nullable |
| `settled_at` | timestamptz | nullable — set when remaining_amount reaches 0 |
| `status` | enum | `open` \| `paid` \| `overdue` |
| `note` | text | nullable |
| `created_at` | timestamptz | from BaseEntity |
| `updated_at` | timestamptz | from BaseEntity |

**Atomicity requirement:** `invoices.status = debt` + `INSERT invoice_debt` must be a single DB transaction.

---

### `debt_payments` (`modules/pos/entities/debt-payment.entity.ts`) — NEW

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `debt_id` | uuid FK | → invoice_debts |
| `amount` | decimal(18,2) | Amount collected in this payment |
| `payment_method` | enum | `cash` \| `bank_transfer` |
| `staff_id` | uuid FK | → users |
| `paid_at` | timestamptz | |
| `note` | text | nullable |

**Business rule:** On each INSERT, decrement `invoice_debts.remaining_amount` and transition `status → paid` when remaining_amount = 0. Must be atomic.

---

## 6. Promotions

Recommended module: `modules/promotion/`

### `discount_codes` — NEW

Reusable codes entered by cashier.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `code` | varchar | unique per org |
| `discount_type` | enum | `percentage` \| `fixed_amount` |
| `discount_value` | decimal(18,2) | Amount or percentage ×100 |
| `min_order_value` | decimal(18,2) | Minimum invoice subtotal to apply |
| `max_uses` | int | nullable = unlimited |
| `used_count` | int | Increment on each redemption |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | |
| `is_active` | boolean | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `vouchers` — NEW

Single-use, fixed-value.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `code` | varchar | unique per org |
| `face_value` | decimal(18,2) | Fixed monetary value |
| `customer_id` | uuid FK | → customers — nullable (generic voucher) |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | |
| `is_used` | boolean | Single-use flag |
| `redeemed_invoice_id` | uuid FK | → invoices — set when redeemed |
| `is_active` | boolean | |
| `created_at` | timestamptz | |

**DiscountCode vs Voucher:**

| | discount_codes | vouchers |
|---|---|---|
| Value type | % or fixed | Fixed only |
| Reusability | Multi-use | Single-use |
| Customer binding | No | Optional |

---

### `promotions` — NEW

Program-level promotion rules.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `name` | varchar | |
| `type` | enum | `order_discount` \| `gift_product` \| `buy_x_get_y` \| `product_discount` |
| `conditions` | jsonb | Rule engine — min amount, product list, customer tier, can_stack |
| `benefits` | jsonb | Discount output — % off, fixed amount, free product |
| `valid_from` | timestamptz | |
| `valid_to` | timestamptz | |
| `applicable_branch_ids` | uuid[] | Empty = all branches |
| `is_active` | boolean | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**`conditions` shape (validated via Zod at application layer):**
```json
{
  "min_order_value": 500000,
  "required_item_ids": [],
  "required_customer_tier": "silver",
  "can_stack": false
}
```

**`benefits` shape:**
```json
{
  "discount_type": "percentage",
  "discount_value": 1000,
  "free_item_id": null,
  "free_quantity": 0
}
```

---

### `invoice_promotions` — NEW

Junction table: one invoice can have N promotions applied.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | Tenant key |
| `invoice_id` | uuid FK | → invoices |
| `promotion_type` | enum | `discount_code` \| `voucher` \| `promotion` |
| `ref_id` | uuid | Polymorphic FK — points to discount_codes, vouchers, or promotions |
| `discount_amount` | decimal(18,2) | Actual discount applied to this invoice |
| `note` | text | nullable |

**Stacking policy** is enforced at the application layer via `promotions.conditions.can_stack`. The DB has no constraint.

---

## 7. Relationship Map

```
[Existing]                       [New — POS]
──────────                       ───────────
users ──────────────┐
                    │ staff_id
branches ───────────┤            invoice_items ──< invoices >── invoice_debts
                    │                │                │               │
customers ──────────┤                │                │          debt_payments
   │                │            items (snap)    invoice_promotions
   │                └──────────────────────────────────┘
   │
   ├── membership_cards ──< point_history
   └── customer_groups

[Promotions]
discount_codes ──┐
vouchers ────────┤──> invoice_promotions
promotions ──────┘
```

---

## 8. Cardinalities

| Relationship | Type |
|---|---|
| `branches` → `invoices` | 1 : N |
| `invoices` → `invoice_items` | 1 : N |
| `invoices` → `invoice_debts` | 1 : 1 (only when status = debt) |
| `invoices` → `invoice_promotions` | 1 : N |
| `customers` → `invoices` | 1 : N (nullable — walk-in allowed) |
| `customers` → `membership_cards` | 1 : 1 |
| `customers` → `customer_groups` | N : 1 |
| `membership_cards` → `point_history` | 1 : N |
| `invoice_debts` → `debt_payments` | 1 : N |
| `items` → `invoice_items` | 1 : N |
| `users` → `invoices` (staff) | 1 : N |
| `users` → `customers` (assigned_staff) | 1 : N |

---

## 9. Lifecycle States

### Invoice
```
draft
  ├── [update items] → draft
  ├── [checkout]     → paid | debt | pending
  └── [discard]      → DELETE
paid       — terminal
debt       — terminal (spawns InvoiceDebt row)
pending    — awaiting payment confirmation
cancelled  — terminal (void, no delete)
```

### InvoiceDebt
```
open     → [DebtPayment partial] → open (remaining_amount decrements)
open     → [DebtPayment full]    → paid (settled_at set)
open     → [overdue scheduler]   → overdue
overdue  → [DebtPayment full]    → paid
paid     — terminal
```

### MembershipCard Tier
```
none → silver → gold → diamond
Promotion: driven by total_spent thresholds (admin-configured, not yet in schema)
```
