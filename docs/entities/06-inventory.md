# Inventory Module Entities

> Manages the full inventory lifecycle: items (products), physical storage
> hierarchy (Storage → Location), stock balances, movement ledger, inter-branch
> transfers, stock adjustments, and CSV bulk imports.

**Source path:** `apps/api/src/modules/inventory/`

---

## ItemEntity

**Table:** `items`
**Extends:** `BaseEntity`
**Description:** A stockable product or material tracked in inventory. Items are identified by a unique `code` per organization. The `unit` field defines the unit of measure (e.g. "pcs", "kg", "m"). Items can be deactivated without deletion.

**Unique constraints:** `(organizationId, code)` — item codes are unique per organization.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `code` | `code` | `varchar` | NN, UQ per org | Short alphanumeric identifier (SKU) for the item |
| `name` | `name` | `varchar` | NN | Human-readable product name |
| `description` | `description` | `varchar` | ? | Detailed description or specifications |
| `unit` | `unit` | `varchar` | NN | Unit of measure (e.g. "pcs", "kg", "box") |
| `category` | `category` | `varchar` | ? | Grouping label for filtering and reporting (e.g. "Electronics", "Furniture") |
| `isActive` | `is_active` | `boolean` | default: `true` | When false, item cannot be used in new transactions |

---

## StorageEntity

**Table:** `storages`
**Extends:** `BaseEntity`
**Description:** A physical warehouse or storage area within a branch. Each branch has at least one storage (the main storage, created automatically). Storages contain multiple `Location` slots.

**Unique constraints:** `(branchId, name)` — storage names are unique within a branch.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `name` | `name` | `varchar` | NN, UQ per branch | Storage name (e.g. "Main Warehouse", "Back Storage") |
| `isMainStorage` | `is_main_storage` | `boolean` | default: `false` | If true, this is the branch's default storage for receiving goods |

**Relations:**
- `branch` → `BranchEntity` (ManyToOne)

---

## ShowroomEntity

**Table:** `showrooms`
**Extends:** `BaseEntity`
**Description:** A display/sales floor area linked to a branch and backed by a storage. The showroom is where customers browse products; its stock is physically sourced from the associated storage. Each branch may have one main showroom.

**Unique constraints:** `(branchId, name)` — showroom names are unique within a branch.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `name` | `name` | `varchar` | NN, UQ per branch | Showroom display name |
| `storageId` | `storage_id` | `uuid` | NN, FK → `storages.id` | The storage backing this showroom's inventory |
| `isMainShowroom` | `is_main_showroom` | `boolean` | default: `false` | If true, this is the branch's primary showroom |

**Relations:**
- `storage` → `StorageEntity` (ManyToOne)
- `branch` → `BranchEntity` (ManyToOne)

---

## LocationEntity

**Table:** `locations`
**Extends:** `BaseEntity`
**Description:** A specific slot within a storage (e.g. a shelf, rack, bin, or zone). Locations are the finest granularity for stock tracking — every `StockBalance` and `StockLedgerEntry` references a location.

**Unique constraints:** `(storageId, code)` — location codes are unique within a storage.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `code` | `code` | `varchar` | NN, UQ per storage | Short identifier for the location (e.g. "A-01-03") |
| `name` | `name` | `varchar` | NN | Human-readable name (e.g. "Aisle A, Rack 1, Shelf 3") |
| `storageId` | `storage_id` | `uuid` | NN, FK → `storages.id` | The storage this location belongs to |
| `type` | `type` | `enum` | NN | Physical type of the location |
| `isActive` | `is_active` | `boolean` | default: `true` | Inactive locations cannot receive new stock |

### LocationType Enum (shared)

| Value | Description |
|-------|-------------|
| `SHELF` | A shelf within a rack |
| `RACK` | A full rack/bay |
| `BIN` | A small container or bin |
| `ZONE` | A broad area (e.g. "Cold Storage Zone") |

**Relations:**
- `storage` → `StorageEntity` (ManyToOne)

---

## StorageManagerAssignmentEntity

**Table:** `storage_manager_assignments`
**Description:** Assigns a user as a manager of a specific storage within a branch. Storage managers can approve transfers and adjustments for their storage.

**Does NOT extend BaseEntity** — uses its own PK.

**Unique constraints:** `(userId, storageId)` — one assignment per user-storage pair.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key |
| `userId` | `user_id` | `uuid` | NN, FK → `users.id` | The user being assigned |
| `branchId` | `branch_id` | `uuid` | NN, FK → `branches.id` | The branch containing the storage |
| `storageId` | `storage_id` | `uuid` | NN, FK → `storages.id` | The storage being managed |
| `organizationId` | `organization_id` | `uuid` | NN | Organization scope |
| `assignedAt` | `assigned_at` | `timestamptz` | auto | When the assignment was created |
| `assignedBy` | `assigned_by` | `uuid` | NN, FK → `users.id` | Who made the assignment |

---

## StockBalanceEntity

**Table:** `stock_balances`
**Extends:** `BaseEntity`
**Description:** Denormalized current stock quantity for an item at a specific location. This is the "materialized" view of the ledger — updated whenever a stock ledger entry is posted. Used for fast stock checks without summing the ledger.

**Unique constraints:** `(organizationId, itemId, locationId)` — one balance row per item-location pair.

**Indexes:** `(organizationId, branchId)`

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `itemId` | `item_id` | `uuid` | NN, FK → `items.id` | The item being tracked |
| `locationId` | `location_id` | `uuid` | NN, FK → `locations.id` | The location holding the stock |
| `quantity` | `quantity` | `numeric` | default: `0` | Current on-hand quantity; can be negative in rare adjustment scenarios |
| `lastMovementAt` | `last_movement_at` | `timestamptz` | ? | Timestamp of the most recent stock movement affecting this balance |

---

## StockLedgerEntryEntity

**Table:** `stock_ledger_entries`
**Extends:** `BaseEntity`
**Description:** Immutable audit log of every stock movement. Each entry records a signed quantity change for an item at a location. The ledger is append-only; corrections are made by posting new offsetting entries. The `referenceType` and `referenceId` link back to the source document (sale, transfer, adjustment, etc.).

**Indexes:**
- `(organizationId, itemId, locationId)` — item movement history at a location
- `(organizationId, branchId, createdAt)` — branch activity timeline

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `itemId` | `item_id` | `uuid` | NN, FK → `items.id` | The item affected |
| `locationId` | `location_id` | `uuid` | NN, FK → `locations.id` | The location affected |
| `movementType` | `movement_type` | `enum` | NN | Categorizes the reason for the stock change |
| `quantity` | `quantity` | `numeric` | NN | Signed quantity: positive = stock in, negative = stock out |
| `referenceType` | `reference_type` | `varchar` | NN | Source document type (e.g. "SALE", "TRANSFER", "ADJUSTMENT") |
| `referenceId` | `reference_id` | `uuid` | NN | UUID of the source document |
| `notes` | `notes` | `varchar` | ? | Optional human-readable note |
| `postedAt` | `posted_at` | `timestamptz` | NN | When this movement was financially posted |

### StockMovementType Enum (shared)

| Value | Description |
|-------|-------------|
| `SALE_ISSUE` | Stock issued for a POS sale (decreases) |
| `RETURN_IN` | Stock returned by customer (increases) |
| `EXCHANGE_IN` | Stock received in an exchange (increases) |
| `EXCHANGE_OUT` | Stock issued in an exchange (decreases) |
| `TRANSFER_IN` | Stock received from another location via transfer (increases) |
| `TRANSFER_OUT` | Stock sent to another location via transfer (decreases) |
| `ADJUSTMENT_INCREASE` | Manual stock increase (e.g. found goods, recount) |
| `ADJUSTMENT_DECREASE` | Manual stock decrease (e.g. damaged, lost, shrinkage) |
| `PURCHASE_RECEIPT` | Stock received from a purchase order (increases) |

---

## StockTransferEntity

**Table:** `stock_transfers`
**Extends:** `BaseEntity`
**Description:** A document authorizing the movement of inventory items between two locations (which may be in different branches for inter-branch transfers). Follows an approval workflow: DRAFT → APPROVED → POSTED. Posting creates the corresponding ledger entries.

**Indexes:** `(organizationId, status)`

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `documentNumber` | `document_number` | `varchar` | ?, UQ | Auto-generated document number (via DocumentNumberRule) |
| `sourceLocationId` | `source_location_id` | `uuid` | NN, FK → `locations.id` | Location from which stock is being sent |
| `destinationLocationId` | `destination_location_id` | `uuid` | NN, FK → `locations.id` | Location receiving the stock |
| `sourceBranchId` | `source_branch_id` | `uuid` | NN, FK → `branches.id` | Branch of the source location |
| `destinationBranchId` | `destination_branch_id` | `uuid` | NN, FK → `branches.id` | Branch of the destination location |
| `status` | `status` | `enum` | default: `DRAFT` | Current workflow status |
| `approvedBy` | `approved_by` | `uuid` | ? | User who approved the transfer |
| `approvedAt` | `approved_at` | `timestamptz` | ? | When the transfer was approved |
| `postedBy` | `posted_by` | `uuid` | ? | User who posted (finalized) the transfer |
| `postedAt` | `posted_at` | `timestamptz` | ? | When the transfer was posted and ledger entries created |
| `notes` | `notes` | `varchar` | ? | Free-text notes about the transfer |

### TransferStatus Enum (shared)

| Value | Description |
|-------|-------------|
| `DRAFT` | Transfer created but not yet submitted for approval |
| `APPROVED` | Transfer approved by a manager; ready to be posted |
| `POSTED` | Transfer finalized; stock ledger entries have been created |
| `CANCELLED` | Transfer was cancelled before posting |

**Relations:**
- `lines` → `StockTransferLineEntity[]` (OneToMany, cascade insert, eager loaded)

---

## StockTransferLineEntity

**Table:** `stock_transfer_lines`
**Description:** A single item line within a stock transfer document. Specifies which item is being moved and the quantity.

**Does NOT extend BaseEntity** — uses its own PK.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key |
| `transferId` | `transfer_id` | `uuid` | NN, FK → `stock_transfers.id` | Parent transfer document |
| `itemId` | `item_id` | `uuid` | NN, FK → `items.id` | The item being transferred |
| `quantity` | `quantity` | `numeric` | NN | Quantity to transfer (always positive) |
| `notes` | `notes` | `varchar` | ? | Per-line notes |

**Relations:**
- `transfer` → `StockTransferEntity` (ManyToOne, CASCADE delete)

---

## StockAdjustmentEntity

**Table:** `stock_adjustments`
**Extends:** `BaseEntity`
**Description:** A document for correcting stock quantities at a location (e.g. after a physical count, damage, or shrinkage). Follows an approval workflow similar to transfers: DRAFT → PENDING_APPROVAL → POSTED. Each line carries a signed quantity (positive = increase, negative = decrease).

**Indexes:** `(organizationId, status)`

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `documentNumber` | `document_number` | `varchar` | ?, UQ | Auto-generated document number |
| `locationId` | `location_id` | `uuid` | NN, FK → `locations.id` | The location being adjusted |
| `reasonCode` | `reason_code` | `varchar` | NN | Machine-readable reason (e.g. "DAMAGE", "RECOUNT", "THEFT") |
| `reasonDescription` | `reason_description` | `varchar` | ? | Human-readable explanation |
| `status` | `status` | `enum` | default: `DRAFT` | Current workflow status |
| `approvedBy` | `approved_by` | `uuid` | ? | User who approved |
| `approvedAt` | `approved_at` | `timestamptz` | ? | When approved |
| `postedBy` | `posted_by` | `uuid` | ? | User who posted |
| `postedAt` | `posted_at` | `timestamptz` | ? | When posted and ledger entries created |
| `notes` | `notes` | `varchar` | ? | Additional notes |

### AdjustmentStatus Enum (local)

| Value | Description |
|-------|-------------|
| `DRAFT` | Adjustment created but not yet submitted |
| `PENDING_APPROVAL` | Submitted and awaiting manager approval |
| `POSTED` | Finalized; stock ledger entries created |
| `CANCELLED` | Cancelled before posting |

**Relations:**
- `lines` → `StockAdjustmentLineEntity[]` (OneToMany, cascade insert, eager loaded)

---

## StockAdjustmentLineEntity

**Table:** `stock_adjustment_lines`
**Description:** A single item line in a stock adjustment. The `quantity` field is signed: positive values increase stock, negative values decrease it.

**Does NOT extend BaseEntity** — uses its own PK.

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key |
| `adjustmentId` | `adjustment_id` | `uuid` | NN, FK → `stock_adjustments.id` | Parent adjustment document |
| `itemId` | `item_id` | `uuid` | NN, FK → `items.id` | The item being adjusted |
| `quantity` | `quantity` | `numeric` | NN | Signed quantity change: positive = increase, negative = decrease |
| `notes` | `notes` | `varchar` | ? | Per-line notes |

**Relations:**
- `adjustment` → `StockAdjustmentEntity` (ManyToOne, CASCADE delete)

---

## InventoryImportJobEntity

**Table:** `inventory_import_jobs`
**Extends:** `BaseEntity`
**Description:** Tracks a bulk CSV import operation. Supports importing items, opening balances, or adjustments. The job goes through a validation phase (rows checked for errors) before committing changes to the database. Idempotency is enforced to prevent duplicate imports.

**Unique constraints:** `(organizationId, type, idempotencyKey)` — prevents re-importing the same file.

**Indexes:** `(organizationId, status)`

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| _BaseEntity fields_ | | | | See [README](./README.md#baseentity-fields) |
| `type` | `type` | `enum` | NN | What type of data is being imported |
| `fileName` | `file_name` | `varchar` | NN | Original uploaded CSV file name |
| `fileChecksum` | `file_checksum` | `varchar` | NN | SHA-256 hash of the file content for integrity verification |
| `idempotencyKey` | `idempotency_key` | `varchar` | NN | Client-provided key to prevent duplicate submissions |
| `status` | `status` | `enum` | default: `VALIDATING` | Current processing state |
| `totalRows` | `total_rows` | `int` | default: `0` | Total number of data rows in the CSV |
| `validRows` | `valid_rows` | `int` | default: `0` | Count of rows that passed validation |
| `errorRows` | `error_rows` | `int` | default: `0` | Count of rows that failed validation |

### ImportJobType Enum (local)

| Value | Description |
|-------|-------------|
| `ITEMS` | Bulk import of item master data |
| `OPENING_BALANCES` | Import initial stock quantities for locations |
| `ADJUSTMENTS` | Bulk stock adjustments |

### ImportJobStatus Enum (shared)

| Value | Description |
|-------|-------------|
| `PENDING` | Job created, not yet started |
| `VALIDATING` | Rows are being validated |
| `VALIDATED` | All rows validated; ready for commit |
| `IMPORTING` | Legacy state for backwards compatibility |
| `COMMITTING` | Changes are being written to the database |
| `COMMITTED` | All valid rows committed |
| `COMPLETED` | Job fully processed |
| `FAILED` | Job failed due to a system error |

**Relations:**
- `rows` → `InventoryImportJobRowEntity[]` (OneToMany)

---

## InventoryImportJobRowEntity

**Table:** `inventory_import_job_rows`
**Description:** Individual row from a CSV import job. Stores the raw parsed data, validation status, and any error messages. Rows transition from VALID → COMMITTED when the job is finalized.

**Does NOT extend BaseEntity** — uses its own PK and timestamps.

**Indexes:** `(jobId, status)`

| Column | DB Column | Type | Constraints | Description |
|--------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK | Surrogate key |
| `jobId` | `job_id` | `uuid` | NN, FK → `inventory_import_jobs.id` | Parent import job |
| `rowNumber` | `row_number` | `int` | NN | 1-based row index from the CSV file |
| `rawData` | `raw_data` | `jsonb` | NN | Parsed CSV row as a key-value object |
| `status` | `status` | `enum` | NN | Row processing status |
| `errorMessages` | `error_messages` | `jsonb` | ? | Array of `{ column?, code, message }` objects describing validation failures |
| `createdAt` | `created_at` | `timestamptz` | auto | Row creation timestamp |
| `updatedAt` | `updated_at` | `timestamptz` | auto | Row last-update timestamp |

### ImportRowStatus Enum (local)

| Value | Description |
|-------|-------------|
| `VALID` | Row passed validation and is ready to commit |
| `ERROR` | Row has validation errors (see `errorMessages`) |
| `COMMITTED` | Row was successfully committed to the database |

**Relations:**
- `job` → `InventoryImportJobEntity` (ManyToOne)
