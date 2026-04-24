# POS (Point of Sale) Module Entities

> Manages the retail sales floor: **sessions** (shifts), **sales** with line
> items and **payments**, **returns**, and end-of-day **reconciliation**.
> All POS transactions are branch-scoped and linked to an active session.

**Source path:** `apps/api/src/modules/pos/entities/`

---

## PosSessionEntity

**Table:** `pos_sessions`
**Extends:** `BaseEntity`
**Description:** Represents a cashier's working shift on a POS terminal. A session must be opened before any sales can be recorded. When the session is closed, a reconciliation is performed comparing expected vs actual cash. Sessions flow through: OPEN → ACTIVE_SALES → CLOSING → CLOSED.

**Indexes:**
- `(organizationId, branchId, status)` — find open sessions at a branch
- `(organizationId, openedBy, createdAt)` — user session history

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `terminalId` | `terminal_id` | `uuid` | ? | Optional reference to a physical terminal/register device |
| `status` | `status` | `enum` | default: `OPEN` | Current session lifecycle state |
| `openedBy` | `opened_by` | `uuid` | NN, FK → `users.id` | Cashier who opened the session |
| `openedAt` | `opened_at` | `timestamptz` | NN | When the session was opened |
| `closedBy` | `closed_by` | `uuid` | ? | User who closed the session (may differ from opener) |
| `closedAt` | `closed_at` | `timestamptz` | ? | When the session was closed |
| `openingCashAmount` | `opening_cash_amount` | `numeric(18,2)` | default: `0` | Cash amount in the register at session start (float/seed money) |

### SessionStatus Enum (shared)

| Value | Description |
|-------|-------------|
| `OPEN` | Session created; ready for sales |
| `ACTIVE_SALES` | At least one sale has been recorded |
| `CLOSING` | Closing process initiated; no more sales allowed |
| `CLOSED` | Session fully closed; reconciliation complete |

---

## SaleEntity

**Table:** `pos_sales`
**Extends:** `BaseEntity`
**Description:** A completed POS sale transaction. Contains one or more line items and one or more payments. The `subtotal`, `taxAmount`, and `totalAmount` are denormalized totals computed from the lines. A sale can be fully or partially returned later, which updates its status.

**Unique constraints:** `(organizationId, documentNumber)`

**Indexes:**
- `(organizationId, sessionId)` — sales within a session
- `(organizationId, branchId, saleDate)` — daily sales reporting
- `(organizationId, customerId)` — customer purchase history

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `documentNumber` | `document_number` | `varchar(100)` | NN, UQ per org | Auto-generated receipt number (e.g. "SAL-20260425-00001") |
| `sessionId` | `session_id` | `uuid` | NN, FK → `pos_sessions.id` | The POS session this sale belongs to |
| `customerId` | `customer_id` | `uuid` | ? | FK → `customers.id`; optional customer linkage for loyalty/receivables |
| `subtotal` | `subtotal` | `numeric(18,2)` | default: `0` | Sum of all line totals before tax |
| `taxAmount` | `tax_amount` | `numeric(18,2)` | default: `0` | Total tax amount |
| `totalAmount` | `total_amount` | `numeric(18,2)` | default: `0` | Final amount after tax (subtotal + taxAmount) |
| `status` | `status` | `enum` | default: `COMPLETED` | Current sale status |
| `saleDate` | `sale_date` | `timestamptz` | NN | Timestamp of the sale (set at creation time) |

### SaleStatus Enum (local)

| Value | Description |
|-------|-------------|
| `COMPLETED` | Sale is finalized and active |
| `RETURNED` | All items have been returned |
| `PARTIALLY_RETURNED` | Some items have been returned but the sale is still partially valid |

**Relations:**
- `lines` → `SaleLineEntity[]` (OneToMany, cascade)
- `payments` → `PaymentEntity[]` (OneToMany, cascade)

---

## SaleLineEntity

**Table:** `pos_sale_lines`
**Extends:** `BaseEntity`
**Description:** A single item line in a POS sale. Records which item was sold, from which location, at what price. The `lineTotal` is `quantity * unitPrice`. Stock is deducted from the specified location when the sale is completed.

**Indexes:**
- `(saleId)` — lines of a sale
- `(itemId)` — item sales history

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `saleId` | `sale_id` | `uuid` | NN, FK → `pos_sales.id` | Parent sale transaction |
| `itemId` | `item_id` | `uuid` | NN, FK → `items.id` | The product sold |
| `locationId` | `location_id` | `uuid` | NN, FK → `locations.id` | Inventory location from which stock was deducted |
| `quantity` | `quantity` | `numeric(18,2)` | NN | Quantity sold |
| `unitPrice` | `unit_price` | `numeric(18,2)` | NN | Price per unit at time of sale |
| `lineTotal` | `line_total` | `numeric(18,2)` | NN | Total for this line (quantity × unitPrice) |
| `taxAmount` | `tax_amount` | `numeric(18,2)` | default: `0` | Tax amount for this line |

**Relations:**
- `sale` → `SaleEntity` (ManyToOne)

---

## PaymentEntity

**Table:** `pos_payments`
**Extends:** `BaseEntity`
**Description:** A payment tendered against a POS sale. A sale can have multiple payments (split tender, e.g. part cash + part card). The sum of all payment amounts should equal or exceed the sale's `totalAmount` (overpayment = change due).

**Indexes:** `(saleId)`

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `saleId` | `sale_id` | `uuid` | NN, FK → `pos_sales.id` | The sale this payment applies to |
| `method` | `method` | `enum` | NN | Payment method used |
| `amount` | `amount` | `numeric(18,2)` | NN | Amount tendered |
| `reference` | `reference` | `varchar(255)` | ? | External reference (card auth code, credit account ID, etc.) |

### PaymentMethod Enum (shared)

| Value | Description |
|-------|-------------|
| `CASH` | Physical cash payment |
| `CARD` | Debit or credit card |
| `CREDIT` | Store credit or customer account credit |
| `OTHER` | Catch-all for other payment methods (voucher, mobile, etc.) |

**Relations:**
- `sale` → `SaleEntity` (ManyToOne)

---

## ReturnEntity

**Table:** `pos_returns`
**Extends:** `BaseEntity`
**Description:** A return transaction against a previously completed sale. Contains one or more return lines referencing original sale lines. The return is always linked to `originalSaleId` and recorded against the current POS session. Creating a return triggers stock restoration to the original location and updates the original sale's status.

**Unique constraints:** `(organizationId, documentNumber)`

**Indexes:**
- `(organizationId, originalSaleId)` — returns for a sale
- `(organizationId, sessionId)` — returns in a session
- `(organizationId, branchId, returnDate)` — daily return reporting

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `documentNumber` | `document_number` | `varchar(100)` | NN, UQ per org | Auto-generated return receipt number |
| `originalSaleId` | `original_sale_id` | `uuid` | NN, FK → `pos_sales.id` | The original sale being returned against |
| `sessionId` | `session_id` | `uuid` | NN, FK → `pos_sessions.id` | The current POS session processing the return |
| `subtotal` | `subtotal` | `numeric(18,2)` | default: `0` | Sum of return line totals before tax |
| `taxAmount` | `tax_amount` | `numeric(18,2)` | default: `0` | Total tax refunded |
| `totalAmount` | `total_amount` | `numeric(18,2)` | default: `0` | Total refund amount |
| `reason` | `reason` | `text` | NN | Customer's or cashier's stated reason for the return |
| `returnDate` | `return_date` | `timestamptz` | NN | When the return was processed |

**Relations:**
- `lines` → `ReturnLineEntity[]` (OneToMany, cascade)

---

## ReturnLineEntity

**Table:** `pos_return_lines`
**Extends:** `BaseEntity`
**Description:** A single item line in a return. References the original sale line to ensure the returned item and price match what was originally sold. Stock is added back to the specified location.

**Indexes:**
- `(returnId)` — lines of a return
- `(originalSaleLineId)` — trace return to original sale line

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `returnId` | `return_id` | `uuid` | NN, FK → `pos_returns.id` | Parent return document |
| `originalSaleLineId` | `original_sale_line_id` | `uuid` | NN, FK → `pos_sale_lines.id` | The original sale line being returned |
| `itemId` | `item_id` | `uuid` | NN, FK → `items.id` | The item being returned |
| `locationId` | `location_id` | `uuid` | NN, FK → `locations.id` | Location where returned stock is placed back |
| `quantity` | `quantity` | `numeric(18,2)` | NN | Quantity being returned (always positive) |
| `unitPrice` | `unit_price` | `numeric(18,2)` | NN | Unit price at time of original sale (for refund calculation) |
| `lineTotal` | `line_total` | `numeric(18,2)` | NN | Total refund for this line (quantity × unitPrice) |

**Relations:**
- `returnDoc` → `ReturnEntity` (ManyToOne)

---

## SessionReconciliationEntity

**Table:** `pos_session_reconciliations`
**Extends:** `BaseEntity`
**Description:** End-of-session cash count reconciliation. Created when a POS session is closed. Compares the expected cash (opening amount + cash sales − cash refunds) against the actual counted cash. A non-zero variance requires managerial approval before the session can be fully closed.

**Unique constraints:** `(organizationId, sessionId)` — one reconciliation per session.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `sessionId` | `session_id` | `uuid` | NN, FK → `pos_sessions.id` | The session being reconciled |
| `expectedCash` | `expected_cash` | `numeric(18,2)` | default: `0` | System-calculated expected cash in the register |
| `actualCash` | `actual_cash` | `numeric(18,2)` | default: `0` | Actual counted cash reported by the cashier |
| `variance` | `variance` | `numeric(18,2)` | default: `0` | Difference: `actualCash − expectedCash` (positive = over, negative = short) |
| `varianceApproved` | `variance_approved` | `boolean` | default: `false` | Whether a manager has approved the variance |
| `approvedBy` | `approved_by` | `uuid` | ? | Manager who approved the variance |
| `approvedAt` | `approved_at` | `timestamptz` | ? | When the variance was approved |
| `notes` | `notes` | `text` | ? | Explanation for the variance |
