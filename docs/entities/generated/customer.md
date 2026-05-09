# Customer Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **1**

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

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Customers full name |
| `email` | `email` | `varchar` | - | Email address; optional but unique within org when provided |
| `phone` | `phone` | `varchar` | - | Phone number for contact or lookup at POS; unique within organization when set |
| `address` | `address` | `varchar` | - | Mailing or billing address |
| `status` | `status` | `enum` | NN, default: CustomerStatus.ACTIVE | Customer lifecycle status (ACTIVE, INACTIVE, MERGED) |
| `mergedIntoId` | `merged_into_id` | `uuid` | - | FK to customers — points to surviving customer after a merge |

### Relations
- `ManyToOne` `mergedInto` → `CustomerEntity`

---
