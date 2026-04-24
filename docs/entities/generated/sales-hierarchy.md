# Sales Hierarchy Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **2**

---

## SalesManagerAssignmentEntity

- **Table:** `sales_manager_assignments`
- **Source:** `apps/api/src/modules/sales-hierarchy/sales-manager-assignment.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Links a user (sales manager) to a branch where they have managerial authority over sales.

### Unique Constraints
- `['userId', 'branchId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `userId` | `user_id` | `uuid` | NN | The user assigned as sales manager |
| `branchId` | `branch_id` | `uuid` | NN | The branch under this managers authority |
| `organizationId` | `organization_id` | `uuid` | NN | Organization scope |
| `assignedAt` | `assigned_at` | `varchar` | NN | When the assignment was created |
| `assignedBy` | `assigned_by` | `uuid` | NN | Who made the assignment |

---

## SalesmanAssignmentEntity

- **Table:** `salesman_assignments`
- **Source:** `apps/api/src/modules/sales-hierarchy/salesman-assignment.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Links a user (salesperson) to a branch where they are authorized to conduct sales.

### Unique Constraints
- `['userId', 'branchId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `userId` | `user_id` | `uuid` | NN | The user assigned as a salesperson |
| `branchId` | `branch_id` | `uuid` | NN | The branch where the user operates |
| `organizationId` | `organization_id` | `uuid` | NN | Organization scope for tenant isolation |
| `assignedAt` | `assigned_at` | `varchar` | NN | Timestamp of assignment creation |
| `assignedBy` | `assigned_by` | `uuid` | NN | Admin or manager who created this assignment |

---
