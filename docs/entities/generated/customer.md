# Customer Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **4**

---

## CustomerEntity

- **Table:** `customers`
- **Source:** `apps/api/src/modules/customer/customer.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Customer who purchases goods. Supports deduplication via merge workflow.

### Indexes
- `'uq_customer_org_email', ['organizationId', 'email'], {
  unique: true,
  where: '"email" IS NOT NULL',
}`
- `'idx_customer_org_status', ['organizationId', 'status']`
- `'uq_customer_org_phone', ['organizationId', 'phone'], {
  unique: true,
  where: '"phone" IS NOT NULL',
}`
- `'uq_customer_org_code', ['organizationId', 'code'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Customers full name |
| `email` | `email` | `varchar` | - | Email address; optional but unique within org when provided |
| `phone` | `phone` | `varchar` | - | Phone number for contact or lookup at POS; unique within organization when set |
| `address` | `address` | `varchar` | - | Mailing or billing address |
| `status` | `status` | `enum` | NN, default: CustomerStatus.ACTIVE | Customer lifecycle status (ACTIVE, INACTIVE, MERGED) |
| `mergedIntoId` | `merged_into_id` | `uuid` | - | FK to customers — points to surviving customer after a merge |
| `code` | `code` | `varchar` | NN | Customer code; required and unique per org e.g. KH000017 |
| `birthDate` | `birth_date` | `date` | - | Date of birth |
| `gender` | `gender` | `enum` | - | Customer gender |
| `nationalId` | `national_id` | `varchar` | - | CCCD / national ID number |
| `groupId` | `group_id` | `uuid` | - | FK to customer_groups |
| `assignedStaffId` | `assigned_staff_id` | `uuid` | - | FK to users — assigned salesperson |
| `note` | `note` | `text` | - | Internal notes |
| `companyName` | `company_name` | `varchar` | - | Company or business name for B2B customers |
| `taxCode` | `tax_code` | `varchar` | - | Business tax identification number (MST) |

### Relations
- `ManyToOne` `mergedInto` → `CustomerEntity`

---

## CustomerGroupEntity

- **Table:** `customer_groups`
- **Source:** `apps/api/src/modules/customer/customer-group.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Lookup table for grouping customers (e.g. VIP, Wholesale).

### Indexes
- `'uq_customer_group_org_name', ['organizationId', 'name'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Group name unique per org |
| `description` | `description` | `text` | - | - |

---

## MembershipCardEntity

- **Table:** `membership_cards`
- **Source:** `apps/api/src/modules/customer/membership-card.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Loyalty/membership card linked 1-to-1 with a customer.

### Indexes
- `'uq_membership_card_customer', ['customerId'], { unique: true }`
- `'uq_membership_card_number', ['organizationId', 'cardNumber'], { unique: true }`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `customerId` | `customer_id` | `uuid` | NN | - |
| `cardNumber` | `card_number` | `varchar` | NN | - |
| `tier` | `tier` | `enum` | NN, default: MembershipTier.NONE | - |
| `points` | `points` | `int` | NN, default: 0 | - |
| `issuedAt` | `issued_at` | `date` | NN | - |
| `expiresAt` | `expires_at` | `date` | - | - |
| `lomasCardNumber` | `lomas_card_number` | `varchar` | - | - |
| `lomasTier` | `lomas_tier` | `varchar` | - | - |
| `isActive` | `is_active` | `boolean` | NN, default: true | - |

---

## PointHistoryEntity

- **Table:** `point_history`
- **Source:** `apps/api/src/modules/customer/point-history.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Immutable ledger of all point transactions against a membership card.

### Indexes
- `['cardId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `cardId` | `card_id` | `uuid` | NN | - |
| `invoiceId` | `invoice_id` | `uuid` | - | - |
| `type` | `type` | `enum` | NN | - |
| `delta` | `delta` | `int` | NN | - |
| `note` | `note` | `text` | - | - |

---
