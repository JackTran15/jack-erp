# POS Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **12**

---

## DebtPaymentEntity

- **Table:** `debt_payments`
- **Source:** `apps/api/src/modules/pos/entities/debt-payment.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Records a single repayment instalment made against an outstanding invoice debt.

### Indexes
- `['debtId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `debtId` | `debt_id` | `uuid` | NN | The invoice debt this payment is applied to |
| `amount` | `amount` | `numeric` | NN | Amount paid in this instalment |
| `paymentMethod` | `payment_method` | `enum` | NN | How the repayment was received |
| `staffId` | `staff_id` | `uuid` | NN | Staff member who collected or recorded this payment |
| `paidAt` | `paid_at` | `timestamptz` | NN | Exact timestamp the repayment was received |
| `note` | `note` | `text` | - | Free-text note about this payment instalment |

---

## InvoiceDebtEntity

- **Table:** `invoice_debts`
- **Source:** `apps/api/src/modules/pos/entities/invoice-debt.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Tracks an outstanding debt created from a credit (debt-payment-method) invoice.

### Indexes
- `['organizationId', 'customerId', 'status']`
- `'uq_invoice_debt_invoice', ['invoiceId'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `referenceCode` | `reference_code` | `varchar` | NN | Human-readable reference code for the debt record |
| `invoiceId` | `invoice_id` | `uuid` | NN | The invoice that generated this debt (1-to-1) |
| `customerId` | `customer_id` | `uuid` | NN | Customer who owes the debt |
| `documentType` | `document_type` | `enum` | NN | Category of the source document that created or adjusted this debt |
| `originalAmount` | `original_amount` | `numeric` | NN | Full invoice amount that was placed on credit |
| `paidAmount` | `paid_amount` | `numeric` | NN, default: 0 | Cumulative amount received against this debt so far |
| `remainingAmount` | `remaining_amount` | `numeric` | NN | Balance still owed (originalAmount − paidAmount) |
| `issuedAt` | `issued_at` | `date` | NN | Calendar date the debt was created |
| `dueDate` | `due_date` | `date` | - | Optional payment deadline |
| `settledAt` | `settled_at` | `timestamptz` | - | Timestamp when the debt was fully settled; null while open |
| `status` | `status` | `enum` | NN, default: DebtStatus.OPEN | Current collection status of the debt |
| `note` | `note` | `text` | - | Free-text note attached to the debt record |

---

## InvoiceEntity

- **Table:** `invoices`
- **Source:** `apps/api/src/modules/pos/entities/invoice.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** POS invoice — supports drafts, full payment, and debt (credit) scenarios.

### Indexes
- `['organizationId', 'branchId', 'issuedAt']`
- `['organizationId', 'customerId']`
- `['organizationId', 'sessionId', 'isDraft']`
- `'uq_invoice_org_code', ['organizationId', 'code'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `code` | `code` | `varchar` | NN | Auto-generated invoice code, unique per organisation |
| `issuedAt` | `issued_at` | `timestamptz` | - | Timestamp the invoice was issued; null while in draft state |
| `status` | `status` | `enum` | NN, default: InvoiceStatus.DRAFT | Current lifecycle status of the invoice |
| `subtotal` | `subtotal` | `numeric` | NN, default: 0 | Sum of all line totals before discount |
| `discountAmount` | `discount_amount` | `numeric` | NN, default: 0 | Total discount applied to the invoice |
| `depositAmount` | `deposit_amount` | `numeric` | NN, default: 0 | Deposit collected upfront (e.g. on layaway) |
| `amountDue` | `amount_due` | `numeric` | NN, default: 0 | Final amount the customer owes (subtotal - discountAmount) |
| `totalPaid` | `total_paid` | `numeric` | NN, default: 0 | Total amount collected across all payment lines |
| `note` | `note` | `text` | - | Free-text note attached to the invoice |
| `isDraft` | `is_draft` | `varchar` | NN, default: true | True while the invoice has not been finalised / committed |
| `sessionId` | `session_id` | `varchar` | NN | POS session that originated this invoice |
| `draftLabel` | `draft_label` | `varchar` | - | User-visible label for in-progress draft (e.g. "Table 3") |
| `customerId` | `customer_id` | `uuid` | - | Customer linked to this invoice; null for anonymous sales |
| `staffId` | `staff_id` | `uuid` | NN | Staff member who created / owns the invoice |
| `priceListId` | `price_list_id` | `uuid` | - | Price list applied at invoice creation (future feature) |
| `cancelledAt` | `cancelled_at` | `timestamptz` | - | - |
| `cancelReason` | `cancel_reason` | `text` | - | - |

---

## InvoiceItemEntity

- **Table:** `invoice_items`
- **Source:** `apps/api/src/modules/pos/entities/invoice-item.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Single line item on a POS invoice. Snapshot columns preserve pricing at the time of sale.

### Indexes
- `['invoiceId']`
- `['itemId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `invoiceId` | `invoice_id` | `uuid` | NN | Parent invoice this line belongs to |
| `itemId` | `item_id` | `uuid` | NN | Live reference to the catalogue item (for reporting) |
| `locationId` | `location_id` | `uuid` | - | Inventory location the stock was drawn from at sale time |
| `itemCode` | `item_code` | `varchar` | NN | Snapshot of the item code at sale time |
| `itemName` | `item_name` | `varchar` | NN | Snapshot of the item name at sale time |
| `unit` | `unit` | `varchar` | NN | Snapshot of the unit of measure at sale time (e.g. "pcs", "kg") |
| `quantity` | `quantity` | `numeric` | NN | Number of units sold |
| `unitPrice` | `unit_price` | `numeric` | NN | Snapshot of the selling price per unit at sale time |
| `unitPriceDefault` | `unit_price_default` | `numeric` | NN, default: 0 | Default catalogue selling price at sale time (server-populated, not from client) |
| `costPrice` | `cost_price` | `numeric` | NN, default: 0 | Cost price (COGS) at sale time (server-populated, not from client) |
| `lineDiscount` | `line_discount` | `numeric` | NN, default: 0 | Discount applied to this line only |
| `lineTotal` | `line_total` | `numeric` | NN | Final line amount (quantity × unitPrice − lineDiscount) |
| `note` | `note` | `text` | - | Free-text note for this line item |
| `sortOrder` | `sort_order` | `int` | NN, default: 0 | Display ordering of lines within the invoice |

---

## InvoicePaymentEntity

- **Table:** `invoice_payments`
- **Source:** `apps/api/src/modules/pos/entities/invoice-payment.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** One payment line tendered against a POS invoice. Multiple records per invoice support split tender.

### Indexes
- `['invoiceId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `invoiceId` | `invoice_id` | `uuid` | NN | Invoice this payment line belongs to |
| `paymentMethod` | `payment_method` | `enum` | NN | Payment method used for this line |
| `amount` | `amount` | `numeric` | NN | Amount tendered via this method |
| `accountId` | `account_id` | `uuid` | NN | GL account to debit for this payment line |
| `reference` | `reference` | `varchar` | - | External reference: card auth code, bank transfer ref, etc. |

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
| `cashAccountId` | `cash_account_id` | `uuid` | - | Cash register/drawer used in this session (required for sessions created after EPIC-009) |

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
