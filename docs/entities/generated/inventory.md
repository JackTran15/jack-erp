# Inventory Entities

Generated from `docs/entities/entity-manifest.json`.

Total entities: **24**

---

## GoodsIssueEntity

- **Table:** `goods_issues`
- **Source:** `apps/api/src/modules/inventory/goods-issue/goods-issue.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Phiếu xuất hàng — goods issue from stock. Workflow: DRAFT → APPROVED → POSTED | CANCELLED

### Indexes
- `['organizationId', 'status']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | - | Auto-generated on posting |
| `locationId` | `location_id` | `uuid` | NN | Source storage location |
| `reason` | `reason` | `varchar` | NN | Reason for issuance (e.g. bán hàng, nội bộ, mẫu) |
| `status` | `status` | `enum` | NN, default: GoodsIssueStatus.DRAFT | - |
| `notes` | `notes` | `varchar` | - | Free-text notes |
| `approvedBy` | `approved_by` | `uuid` | - | - |
| `approvedAt` | `approved_at` | `timestamptz` | - | - |
| `postedBy` | `posted_by` | `uuid` | - | - |
| `postedAt` | `posted_at` | `timestamptz` | - | - |

### Relations
- `OneToMany` `lines` → `GoodsIssueLineEntity`

---

## GoodsIssueLineEntity

- **Table:** `goods_issue_lines`
- **Source:** `apps/api/src/modules/inventory/goods-issue/goods-issue-line.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Single item line within a goods issue document.

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `goodsIssueId` | `goods_issue_id` | `uuid` | NN | Parent goods issue document |
| `itemId` | `item_id` | `uuid` | NN | Item being issued from stock |
| `quantity` | `quantity` | `numeric` | NN | Quantity to issue (always positive) |
| `notes` | `notes` | `varchar` | - | Per-line notes |

### Relations
- `ManyToOne` `goodsIssue` → `GoodsIssueEntity`

---

## InventoryImportJobEntity

- **Table:** `inventory_import_jobs`
- **Source:** `apps/api/src/modules/inventory/csv/inventory-import-job.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Tracks a bulk CSV import operation for items, opening balances, or adjustments. Enforces idempotency.

### Unique Constraints
- `['organizationId', 'type', 'idempotencyKey']`

### Indexes
- `['organizationId', 'status']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `type` | `type` | `enum` | NN | What type of data is being imported (ITEMS, OPENING_BALANCES, ADJUSTMENTS) |
| `fileName` | `file_name` | `varchar` | NN | Original uploaded CSV file name |
| `fileChecksum` | `file_checksum` | `varchar` | NN | SHA-256 hash of the file content for integrity verification |
| `idempotencyKey` | `idempotency_key` | `varchar` | NN | Client-provided key to prevent duplicate submissions |
| `status` | `status` | `enum` | NN, default: ImportJobStatus.VALIDATING | Current processing state |
| `totalRows` | `total_rows` | `int` | NN, default: 0 | Total number of data rows in the CSV |
| `validRows` | `valid_rows` | `int` | NN, default: 0 | Count of rows that passed validation |
| `errorRows` | `error_rows` | `int` | NN, default: 0 | Count of rows that failed validation |

### Relations
- `OneToMany` `rows` → `InventoryImportJobRowEntity`

---

## InventoryImportJobRowEntity

- **Table:** `inventory_import_job_rows`
- **Source:** `apps/api/src/modules/inventory/csv/inventory-import-job-row.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Individual row from a CSV import job. Stores raw data, validation status, and errors.

### Indexes
- `['jobId', 'status']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `jobId` | `job_id` | `uuid` | NN | Parent import job |
| `rowNumber` | `row_number` | `int` | NN | 1-based row index from the CSV file |
| `rawData` | `raw_data` | `jsonb` | NN | Parsed CSV row as a key-value object |
| `status` | `status` | `enum` | NN | Row processing status (VALID, ERROR, COMMITTED) |
| `errorMessages` | `error_messages` | `jsonb` | - | Array of { column?, code, message } objects describing validation failures |
| `createdAt` | `created_at` | `varchar` | NN | - |
| `updatedAt` | `updated_at` | `varchar` | NN | - |

### Relations
- `ManyToOne` `job` → `InventoryImportJobEntity`

---

## ItemAttributeValueEntity

- **Table:** `item_attribute_values`
- **Source:** `apps/api/src/modules/inventory/product/item-attribute-value.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Junction: links an item (variant) to one option per attribute dimension.

### Unique Constraints
- `['itemId', 'attributeDefinitionId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `itemId` | `item_id` | `uuid` | NN | FK to items — the variant item |
| `attributeDefinitionId` | `attribute_definition_id` | `uuid` | NN | FK to attribute definition (which dimension) |
| `optionId` | `option_id` | `uuid` | NN | FK to attribute option (which value in that dimension) |

### Relations
- `ManyToOne` `item` → `ItemEntity`
- `ManyToOne` `attributeDefinition` → `ProductAttributeDefinitionEntity`
- `ManyToOne` `option` → `ProductAttributeOptionEntity`

---

## ItemCategoryEntity

- **Table:** `inventory_item_categories`
- **Source:** `apps/api/src/modules/inventory/location/item-category.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** User-defined product category label (per organization), used when assigning items.

### Unique Constraints
- `['organizationId', 'name']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Display name of the category (unique per organization) |

---

## ItemEntity

- **Table:** `items`
- **Source:** `apps/api/src/modules/inventory/location/item.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** A stockable product or material tracked in inventory. Identified by unique code per organization.

### Unique Constraints
- `['organizationId', 'code']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `code` | `code` | `varchar` | NN | Short alphanumeric identifier (SKU) for the item |
| `name` | `name` | `varchar` | NN | Human-readable product name |
| `description` | `description` | `varchar` | - | Detailed description or specifications |
| `unit` | `unit` | `varchar` | NN | Unit of measure (e.g. pcs, kg, box) |
| `category` | `category` | `varchar` | - | Grouping label for filtering and reporting (e.g. Electronics, Furniture) |
| `isActive` | `is_active` | `varchar` | NN, default: true | When false, item cannot be used in new transactions |
| `purchasePrice` | `purchase_price` | `decimal` | NN, default: 0 | Default purchase (cost) price per unit |
| `sellingPrice` | `selling_price` | `decimal` | NN, default: 0 | Default selling price per unit |
| `providerId` | `provider_id` | `uuid` | NN | FK to inventory_providers — the supplier for this item |
| `productId` | `product_id` | `uuid` | - | FK to products — null for legacy items without a parent product |
| `variantLabel` | `variant_label` | `varchar` | - | Denormalized display label for variant attributes (e.g. "39 · Nâu") |

### Relations
- `ManyToOne` `provider` → `ProviderEntity`
- `ManyToOne` `product` → `ProductEntity`

---

## LocationEntity

- **Table:** `locations`
- **Source:** `apps/api/src/modules/inventory/location/location.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Specific slot within a storage (shelf, rack, bin, zone). Finest granularity for stock tracking.

### Unique Constraints
- `['storageId', 'code']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `code` | `code` | `varchar` | NN | Short identifier for the location (e.g. A-01-03) |
| `name` | `name` | `varchar` | NN | Human-readable name (e.g. Aisle A, Rack 1, Shelf 3) |
| `storageId` | `storage_id` | `uuid` | NN | FK to storages — the storage this location belongs to |
| `type` | `type` | `enum` | NN | Physical type of the location (SHELF, RACK, BIN, ZONE) |
| `isActive` | `is_active` | `varchar` | NN, default: true | Inactive locations cannot receive new stock |

### Relations
- `ManyToOne` `storage` → `StorageEntity`

---

## ProductAttributeDefinitionEntity

- **Table:** `product_attribute_definitions`
- **Source:** `apps/api/src/modules/inventory/product/product-attribute-definition.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** A dimension of variation for a product (e.g. Size, Color).

### Unique Constraints
- `['productId', 'name']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `productId` | `product_id` | `uuid` | NN | FK to products — the product this attribute belongs to |
| `name` | `name` | `varchar` | NN | Attribute dimension name (e.g. Size, Color) |
| `sortOrder` | `sort_order` | `int` | NN, default: 0 | Display ordering among sibling definitions |

### Relations
- `ManyToOne` `product` → `ProductEntity`
- `OneToMany` `options` → `ProductAttributeOptionEntity`

---

## ProductAttributeOptionEntity

- **Table:** `product_attribute_options`
- **Source:** `apps/api/src/modules/inventory/product/product-attribute-option.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** A specific value within an attribute dimension (e.g. "39", "Nâu").

### Indexes
- `['attributeDefinitionId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `attributeDefinitionId` | `attribute_definition_id` | `uuid` | NN | FK to the parent attribute definition |
| `valueLabel` | `value_label` | `varchar` | NN | Display label for the option value |
| `sortOrder` | `sort_order` | `int` | NN, default: 0 | Display ordering among sibling options |
| `codeSuffix` | `code_suffix` | `varchar` | - | Short code appended to SKU when generating variant codes |

### Relations
- `ManyToOne` `attributeDefinition` → `ProductAttributeDefinitionEntity`

---

## ProductEntity

- **Table:** `products`
- **Source:** `apps/api/src/modules/inventory/product/product.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** A product grouping that may have multiple item variants (SKUs). Org-level, not per-branch.

### Indexes
- `['organizationId', 'isActive']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Human-readable product name |
| `description` | `description` | `varchar` | - | Detailed product description |
| `isActive` | `is_active` | `varchar` | NN, default: true | Inactive products are hidden from catalog |
| `defaultProviderId` | `default_provider_id` | `uuid` | - | Default supplier for variants of this product |
| `autoMigrated` | `auto_migrated` | `varchar` | NN, default: false | True if created by legacy migration script (TKT-036) |

### Relations
- `ManyToOne` `defaultProvider` → `ProviderEntity`

---

## ProductStorageLocationEntity

- **Table:** `product_storage_locations`
- **Source:** `apps/api/src/modules/inventory/product/product-storage-location.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Maps a product to exactly one location within a storage.
Constraint: one product can only be stored in one location per storage (warehouse).

### Unique Constraints
- `['productId', 'storageId']`

### Indexes
- `['storageId', 'locationId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `productId` | `product_id` | `uuid` | NN | FK to products |
| `storageId` | `storage_id` | `uuid` | NN | FK to storages — which warehouse |
| `locationId` | `location_id` | `uuid` | NN | FK to locations — assigned position in that storage |

### Relations
- `ManyToOne` `product` → `ProductEntity`

---

## ProviderEntity

- **Table:** `inventory_providers`
- **Source:** `apps/api/src/modules/inventory/location/provider.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Supplier / vendor who provides items to the organization.

### Unique Constraints
- `['organizationId', 'code']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `code` | `code` | `varchar` | NN | Short alphanumeric code unique per organization |
| `name` | `name` | `varchar` | NN | Human-readable provider name |
| `email` | `email` | `varchar` | - | Contact email address |
| `phone` | `phone` | `varchar` | - | Contact phone number |
| `notes` | `notes` | `varchar` | - | Free-text notes or address info |
| `isActive` | `is_active` | `varchar` | NN, default: true | Inactive providers cannot be assigned to new items |

---

## PurchaseOrderEntity

- **Table:** `purchase_orders`
- **Source:** `apps/api/src/modules/inventory/purchase-order/purchase-order.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Phiếu đặt hàng — purchase order from supplier. Workflow: DRAFT → APPROVED → RECEIVING → RECEIVED | CANCELLED

### Indexes
- `['organizationId', 'status']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | - | Auto-generated on approval |
| `providerId` | `provider_id` | `uuid` | NN | Supplier (inventory_providers) |
| `locationId` | `location_id` | `uuid` | NN | Destination storage location for received goods |
| `status` | `status` | `enum` | NN, default: PurchaseOrderStatus.DRAFT | - |
| `expectedDate` | `expected_date` | `date` | - | Expected delivery date |
| `notes` | `notes` | `varchar` | - | Free-text notes |
| `approvedBy` | `approved_by` | `uuid` | - | - |
| `approvedAt` | `approved_at` | `timestamptz` | - | - |

### Relations
- `OneToMany` `lines` → `PurchaseOrderLineEntity`

---

## PurchaseOrderLineEntity

- **Table:** `purchase_order_lines`
- **Source:** `apps/api/src/modules/inventory/purchase-order/purchase-order-line.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Single item line within a purchase order.

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `purchaseOrderId` | `purchase_order_id` | `uuid` | NN | Parent purchase order |
| `itemId` | `item_id` | `uuid` | NN | Item being ordered |
| `orderedQuantity` | `ordered_quantity` | `numeric` | NN | Quantity ordered from supplier |
| `receivedQuantity` | `received_quantity` | `numeric` | NN, default: 0 | Quantity already received into stock |
| `unitPrice` | `unit_price` | `numeric` | NN, default: 0 | Unit purchase price |
| `notes` | `notes` | `varchar` | - | Per-line notes |

### Relations
- `ManyToOne` `purchaseOrder` → `PurchaseOrderEntity`

---

## ShowroomEntity

- **Table:** `showrooms`
- **Source:** `apps/api/src/modules/inventory/location/showroom.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Display/sales floor area linked to a branch and backed by a storage.

### Unique Constraints
- `['branchId', 'name']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Showroom display name |
| `storageId` | `storage_id` | `uuid` | NN | FK to storages — the storage backing this showrooms inventory |
| `isMainShowroom` | `is_main_showroom` | `varchar` | NN, default: false | If true, this is the branchs primary showroom |

### Relations
- `ManyToOne` `storage` → `StorageEntity`
- `ManyToOne` `branch` → `BranchEntity`

---

## StockAdjustmentEntity

- **Table:** `stock_adjustments`
- **Source:** `apps/api/src/modules/inventory/adjustment/stock-adjustment.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Document for correcting stock quantities at a location. Workflow: DRAFT → PENDING_APPROVAL → POSTED.

### Indexes
- `['organizationId', 'status']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | - | Auto-generated document number |
| `locationId` | `location_id` | `uuid` | NN | The location being adjusted |
| `reasonCode` | `reason_code` | `varchar` | NN | Machine-readable reason (e.g. DAMAGE, RECOUNT, THEFT) |
| `reasonDescription` | `reason_description` | `varchar` | - | Human-readable explanation |
| `status` | `status` | `enum` | NN, default: AdjustmentStatus.DRAFT | Current workflow status (DRAFT, PENDING_APPROVAL, POSTED, CANCELLED) |
| `approvedBy` | `approved_by` | `uuid` | - | User who approved the adjustment |
| `approvedAt` | `approved_at` | `timestamptz` | - | When approved |
| `postedBy` | `posted_by` | `uuid` | - | User who posted the adjustment |
| `postedAt` | `posted_at` | `timestamptz` | - | When posted and ledger entries created |
| `notes` | `notes` | `varchar` | - | Additional notes |

### Relations
- `OneToMany` `lines` → `StockAdjustmentLineEntity`

---

## StockAdjustmentLineEntity

- **Table:** `stock_adjustment_lines`
- **Source:** `apps/api/src/modules/inventory/adjustment/stock-adjustment-line.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Single item line in a stock adjustment. Quantity is signed: positive = increase, negative = decrease.

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `adjustmentId` | `adjustment_id` | `uuid` | NN | Parent adjustment document |
| `itemId` | `item_id` | `uuid` | NN | The item being adjusted |
| `quantity` | `quantity` | `numeric` | NN | Signed quantity change: positive = increase, negative = decrease |
| `notes` | `notes` | `varchar` | - | Per-line notes |

### Relations
- `ManyToOne` `adjustment` → `StockAdjustmentEntity`

---

## StockBalanceEntity

- **Table:** `stock_balances`
- **Source:** `apps/api/src/modules/inventory/ledger/stock-balance.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Denormalized current stock quantity per item per location. Updated on every ledger posting.

### Unique Constraints
- `['organizationId', 'itemId', 'locationId']`

### Indexes
- `['organizationId', 'branchId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `itemId` | `item_id` | `uuid` | NN | The item being tracked |
| `locationId` | `location_id` | `uuid` | NN | The location holding the stock |
| `quantity` | `quantity` | `numeric` | NN, default: 0 | Current on-hand quantity; can be negative in rare adjustment scenarios |
| `lastMovementAt` | `last_movement_at` | `timestamptz` | - | Timestamp of the most recent stock movement affecting this balance |

### Relations
- `ManyToOne` `item` → `ItemEntity`

---

## StockLedgerEntryEntity

- **Table:** `stock_ledger_entries`
- **Source:** `apps/api/src/modules/inventory/ledger/stock-ledger-entry.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Immutable audit log of every stock movement. Append-only; corrections are offsetting entries.

### Indexes
- `['organizationId', 'itemId', 'locationId']`
- `['organizationId', 'branchId', 'createdAt']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `itemId` | `item_id` | `uuid` | NN | The item affected by this movement |
| `locationId` | `location_id` | `uuid` | NN | The location affected by this movement |
| `movementType` | `movement_type` | `enum` | NN | Categorizes the reason for the stock change |
| `quantity` | `quantity` | `numeric` | NN | Signed quantity: positive = stock in, negative = stock out |
| `referenceType` | `reference_type` | `varchar` | NN | Source document type (e.g. SALE, TRANSFER, ADJUSTMENT) |
| `referenceId` | `reference_id` | `uuid` | NN | UUID of the source document |
| `notes` | `notes` | `varchar` | - | Optional human-readable note |
| `postedAt` | `posted_at` | `timestamptz` | NN | When this movement was financially posted |

---

## StockTransferEntity

- **Table:** `stock_transfers`
- **Source:** `apps/api/src/modules/inventory/transfer/stock-transfer.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Document authorizing movement of inventory between locations/branches. Workflow: DRAFT → APPROVED → POSTED.

### Indexes
- `['organizationId', 'status']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `documentNumber` | `document_number` | `varchar` | - | Auto-generated document number via DocumentNumberRule |
| `sourceLocationId` | `source_location_id` | `uuid` | NN | Location from which stock is being sent |
| `destinationLocationId` | `destination_location_id` | `uuid` | NN | Location receiving the stock |
| `sourceBranchId` | `source_branch_id` | `uuid` | NN | Branch of the source location |
| `destinationBranchId` | `destination_branch_id` | `uuid` | NN | Branch of the destination location |
| `status` | `status` | `enum` | NN, default: TransferStatus.DRAFT | Current workflow status (DRAFT, APPROVED, POSTED, CANCELLED) |
| `approvedBy` | `approved_by` | `uuid` | - | User who approved the transfer |
| `approvedAt` | `approved_at` | `timestamptz` | - | When the transfer was approved |
| `postedBy` | `posted_by` | `uuid` | - | User who posted (finalized) the transfer |
| `postedAt` | `posted_at` | `timestamptz` | - | When the transfer was posted and ledger entries created |
| `notes` | `notes` | `varchar` | - | Free-text notes about the transfer |

### Relations
- `OneToMany` `lines` → `StockTransferLineEntity`

---

## StockTransferLineEntity

- **Table:** `stock_transfer_lines`
- **Source:** `apps/api/src/modules/inventory/transfer/stock-transfer-line.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Single item line within a stock transfer document.

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `transferId` | `transfer_id` | `uuid` | NN | Parent transfer document |
| `itemId` | `item_id` | `uuid` | NN | The item being transferred |
| `quantity` | `quantity` | `numeric` | NN | Quantity to transfer (always positive) |
| `notes` | `notes` | `varchar` | - | Per-line notes |

### Relations
- `ManyToOne` `transfer` → `StockTransferEntity`

---

## StorageEntity

- **Table:** `storages`
- **Source:** `apps/api/src/modules/inventory/location/storage.entity.ts`
- **Extends BaseEntity:** Yes
- **Description:** Physical warehouse or storage area within a branch. Contains multiple Locations.

### Unique Constraints
- `['branchId', 'name']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `name` | `name` | `varchar` | NN | Storage name (e.g. Main Warehouse, Back Storage) |
| `isMainStorage` | `is_main_storage` | `varchar` | NN, default: false | If true, this is the branchs default storage for receiving goods |

### Relations
- `ManyToOne` `branch` → `BranchEntity`

---

## StorageManagerAssignmentEntity

- **Table:** `storage_manager_assignments`
- **Source:** `apps/api/src/modules/inventory/location/storage-manager-assignment.entity.ts`
- **Extends BaseEntity:** No
- **Description:** Assigns a user as a manager of a specific storage within a branch.

### Unique Constraints
- `['userId', 'storageId']`

### Columns

| Property | DB Column | Type | Constraints | Description |
|----------|-----------|------|-------------|-------------|
| `id` | `id` | `uuid` | PK, NN | - |
| `userId` | `user_id` | `uuid` | NN | The user being assigned as storage manager |
| `branchId` | `branch_id` | `uuid` | NN | The branch containing the storage |
| `storageId` | `storage_id` | `uuid` | NN | The storage being managed |
| `organizationId` | `organization_id` | `uuid` | NN | Organization scope |
| `assignedAt` | `assigned_at` | `varchar` | NN | When the assignment was created |
| `assignedBy` | `assigned_by` | `uuid` | NN | Who made the assignment |

---
