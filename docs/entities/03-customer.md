# Customer Module Entities

> Customer records used across POS sales, receivables, and reporting.
> Supports deduplication via a merge workflow.

**Source path:** `apps/api/src/modules/customer/`

---

## CustomerEntity

**Table:** `customers`
**Extends:** `BaseEntity`
**Description:** A customer who purchases goods at a branch. Customers can optionally be linked to POS sales and accounts-receivable records. The merge feature allows consolidating duplicate customer records: the source record's status becomes `MERGED` and `mergedIntoId` points to the surviving record.

**Unique constraints:**
- `(organizationId, email)` — conditional unique where email is not null (partial index)

**Indexes:**
- `(organizationId, status)` — filter by active/inactive customers
- `(organizationId, phone)` — phone lookup

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `firstName` | `first_name` | `varchar` | NN | Customer's given name |
| `lastName` | `last_name` | `varchar` | NN | Customer's family name |
| `email` | `email` | `varchar` | ?, UQ per org (partial) | Email address; optional but unique within the org when provided |
| `phone` | `phone` | `varchar` | ? | Phone number for contact or lookup at POS |
| `address` | `address` | `varchar` | ? | Mailing or billing address |
| `status` | `status` | `enum` | default: `ACTIVE` | Customer lifecycle status |
| `mergedIntoId` | `merged_into_id` | `uuid` | ? | FK → `customers.id`; points to the surviving customer after a merge operation |

### CustomerStatus Enum

| Value | Description |
|-------|-------------|
| `ACTIVE` | Customer is active and can be used in transactions |
| `INACTIVE` | Customer is deactivated; cannot be selected for new sales |
| `MERGED` | Customer was merged into another record; `mergedIntoId` holds the target |

**Relations:**
- `mergedInto` → `CustomerEntity` (self-referencing ManyToOne, nullable)
