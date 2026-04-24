# POS Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **7**

---

## PaymentEntity

- **Table:** `pos_payments`
- **Source:** `apps/api/src/modules/pos/entities/payment.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Payment tendered against a POS sale. Supports split tender (multiple payments per sale).

### Indexes
- `['saleId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `saleId` | `sale_id` | `uuid` | NN | The sale this payment applies to |
| `method` | `method` | `enum` | NN | Payment method used (CASH, CARD, CREDIT, OTHER) |
| `amount` | `amount` | `numeric` | NN | Amount tendered |
| `reference` | `reference` | `varchar` | - | External reference (card auth code, credit account ID, etc.) |

### Relations
- `ManyToOne` `sale` → `SaleEntity`

---

## PosSessionEntity

- **Table:** `pos_sessions`
- **Source:** `apps/api/src/modules/pos/entities/pos-session.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Cashier's working shift on a POS terminal. Must be opened before recording sales. Lifecycle: OPEN → ACTIVE_SALES → CLOSING → CLOSED.

### Indexes
- `['organizationId', 'branchId', 'status']`
- `['organizationId', 'openedBy', 'createdAt']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `terminalId` | `terminal_id` | `uuid` | - | Optional reference to a physical terminal/register device |
| `status` | `status` | `enum` | NN, default: SessionStatus.OPEN | Current session lifecycle state (OPEN, ACTIVE_SALES, CLOSING, CLOSED) |
| `openedBy` | `opened_by` | `uuid` | NN | Cashier who opened the session |
| `openedAt` | `opened_at` | `timestamptz` | NN | When the session was opened |
| `closedBy` | `closed_by` | `uuid` | - | User who closed the session |
| `closedAt` | `closed_at` | `timestamptz` | - | When the session was closed |
| `openingCashAmount` | `opening_cash_amount` | `numeric` | NN, default: 0 | Cash amount in the register at session start (float/seed money) |

---

## ReturnEntity

- **Table:** `pos_returns`
- **Source:** `apps/api/src/modules/pos/entities/return.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Return transaction against a previously completed sale. Triggers stock restoration and updates sale status.

### Indexes
- `'uq_return_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
}`
- `['organizationId', 'originalSaleId']`
- `['organizationId', 'sessionId']`
- `['organizationId', 'branchId', 'returnDate']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | NN | Auto-generated return receipt number |
| `originalSaleId` | `original_sale_id` | `uuid` | NN | The original sale being returned against |
| `sessionId` | `session_id` | `uuid` | NN | The current POS session processing the return |
| `subtotal` | `subtotal` | `numeric` | NN, default: 0 | Sum of return line totals before tax |
| `taxAmount` | `tax_amount` | `numeric` | NN, default: 0 | Total tax refunded |
| `totalAmount` | `total_amount` | `numeric` | NN, default: 0 | Total refund amount |
| `reason` | `reason` | `text` | NN | Stated reason for the return |
| `returnDate` | `return_date` | `timestamptz` | NN | When the return was processed |

### Relations
- `OneToMany` `lines` → `ReturnLineEntity`

---

## ReturnLineEntity

- **Table:** `pos_return_lines`
- **Source:** `apps/api/src/modules/pos/entities/return-line.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Single item line in a return. References the original sale line. Stock added back to location.

### Indexes
- `['returnId']`
- `['originalSaleLineId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `returnId` | `return_id` | `uuid` | NN | Parent return document |
| `originalSaleLineId` | `original_sale_line_id` | `uuid` | NN | The original sale line being returned |
| `itemId` | `item_id` | `uuid` | NN | The item being returned |
| `locationId` | `location_id` | `uuid` | NN | Location where returned stock is placed back |
| `quantity` | `quantity` | `numeric` | NN | Quantity being returned (always positive) |
| `unitPrice` | `unit_price` | `numeric` | NN | Unit price at time of original sale |
| `lineTotal` | `line_total` | `numeric` | NN | Total refund for this line (quantity x unitPrice) |

### Relations
- `ManyToOne` `returnDoc` → `ReturnEntity`

---

## SaleEntity

- **Table:** `pos_sales`
- **Source:** `apps/api/src/modules/pos/entities/sale.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Completed POS sale transaction with line items and payments. Can be fully or partially returned.

### Indexes
- `'uq_sale_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
}`
- `['organizationId', 'sessionId']`
- `['organizationId', 'branchId', 'saleDate']`
- `['organizationId', 'customerId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | NN | Auto-generated receipt number (e.g. SAL-20260425-00001) |
| `sessionId` | `session_id` | `uuid` | NN | The POS session this sale belongs to |
| `customerId` | `customer_id` | `uuid` | - | Optional customer linkage for loyalty/receivables |
| `subtotal` | `subtotal` | `numeric` | NN, default: 0 | Sum of all line totals before tax |
| `taxAmount` | `tax_amount` | `numeric` | NN, default: 0 | Total tax amount across all lines |
| `totalAmount` | `total_amount` | `numeric` | NN, default: 0 | Final amount after tax (subtotal + taxAmount) |
| `status` | `status` | `enum` | NN, default: SaleStatus.COMPLETED | Current sale status (COMPLETED, RETURNED, PARTIALLY_RETURNED) |
| `saleDate` | `sale_date` | `timestamptz` | NN | Timestamp of the sale |

### Relations
- `OneToMany` `lines` → `SaleLineEntity`
- `OneToMany` `payments` → `PaymentEntity`

---

## SaleLineEntity

- **Table:** `pos_sale_lines`
- **Source:** `apps/api/src/modules/pos/entities/sale-line.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Single item line in a POS sale. Stock deducted from the specified location on completion.

### Indexes
- `['saleId']`
- `['itemId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `saleId` | `sale_id` | `uuid` | NN | Parent sale transaction |
| `itemId` | `item_id` | `uuid` | NN | The product sold |
| `locationId` | `location_id` | `uuid` | NN | Inventory location from which stock was deducted |
| `quantity` | `quantity` | `numeric` | NN | Quantity sold |
| `unitPrice` | `unit_price` | `numeric` | NN | Price per unit at time of sale |
| `lineTotal` | `line_total` | `numeric` | NN | Total for this line (quantity x unitPrice) |
| `taxAmount` | `tax_amount` | `numeric` | NN, default: 0 | Tax amount for this line |

### Relations
- `ManyToOne` `sale` → `SaleEntity`

---

## SessionReconciliationEntity

- **Table:** `pos_session_reconciliations`
- **Source:** `apps/api/src/modules/pos/entities/session-reconciliation.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** End-of-session cash count reconciliation. Compares expected vs actual cash. Variance requires manager approval.

### Indexes
- `['organizationId', 'sessionId'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `sessionId` | `session_id` | `uuid` | NN | The session being reconciled |
| `expectedCash` | `expected_cash` | `numeric` | NN, default: 0 | System-calculated expected cash in the register |
| `actualCash` | `actual_cash` | `numeric` | NN, default: 0 | Actual counted cash reported by the cashier |
| `variance` | `variance` | `numeric` | NN, default: 0 | Difference: actualCash minus expectedCash (positive = over, negative = short) |
| `varianceApproved` | `variance_approved` | `boolean` | NN, default: false | Whether a manager has approved the variance |
| `approvedBy` | `approved_by` | `uuid` | - | Manager who approved the variance |
| `approvedAt` | `approved_at` | `timestamptz` | - | When the variance was approved |
| `notes` | `notes` | `text` | - | Explanation for the variance |

---
