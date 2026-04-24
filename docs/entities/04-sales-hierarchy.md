# Sales Hierarchy Module Entities

> Manages the assignment of sales staff and sales managers to branches.
> These assignments determine who can create POS sales at a branch and who
> has managerial oversight (approvals, reporting).

**Source path:** `apps/api/src/modules/sales-hierarchy/`

---

## SalesmanAssignmentEntity

**Table:** `salesman_assignments`
**Description:** Links a user (salesperson) to a branch where they are authorized to conduct sales. A user can be a salesman at multiple branches. The `assignedBy` field provides an audit trail of who made the assignment.

**Does NOT extend BaseEntity** — uses its own PK and timestamps.

**Unique constraints:** `(userId, branchId)` — a user can only be assigned as a salesman to a given branch once.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key for the assignment |
| `userId` | `user_id` | `uuid` | NN, FK → `users.id` | The user being assigned as a salesperson |
| `branchId` | `branch_id` | `uuid` | NN, FK → `branches.id` | The branch where the user will operate |
| `organizationId` | `organization_id` | `uuid` | NN | Organization scope for tenant isolation |
| `assignedAt` | `assigned_at` | `timestamptz` | auto | Timestamp of assignment creation |
| `assignedBy` | `assigned_by` | `uuid` | NN, FK → `users.id` | Admin or manager who created this assignment |

---

## SalesManagerAssignmentEntity

**Table:** `sales_manager_assignments`
**Description:** Links a user (sales manager) to a branch where they have managerial authority. Sales managers can approve transactions, view reports, and manage salespeople at their assigned branch. Structurally identical to `SalesmanAssignment` but represents a different authorization level.

**Does NOT extend BaseEntity** — uses its own PK and timestamps.

**Unique constraints:** `(userId, branchId)` — one manager assignment per user-branch pair.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key for the assignment |
| `userId` | `user_id` | `uuid` | NN, FK → `users.id` | The user being assigned as sales manager |
| `branchId` | `branch_id` | `uuid` | NN, FK → `branches.id` | The branch under this manager's authority |
| `organizationId` | `organization_id` | `uuid` | NN | Organization scope |
| `assignedAt` | `assigned_at` | `timestamptz` | auto | When the assignment was created |
| `assignedBy` | `assigned_by` | `uuid` | NN, FK → `users.id` | Who made the assignment |
