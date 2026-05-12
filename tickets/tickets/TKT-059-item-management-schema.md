# TKT-059 Item management schema & migration

## Epic

[EPIC-010 Item Management Enhancement](../epics/EPIC-010-item-management-enhancement.md)

## Summary

Một migration TypeORM duy nhất cho toàn bộ schema change Phase 1: alter `items`, tạo 3 bảng mới (`item_providers`, `item_barcodes`, `item_stock_thresholds`), data migration cho `items.category` → `category_id` và `items.provider_id` → `item_providers`, drop 2 cột cũ.

## Deliverables

- 1 migration file `<timestamp>-item-management-phase1.ts`.
- Entity classes mới: `ItemProviderEntity`, `ItemBarcodeEntity`, `ItemStockThresholdEntity`.
- Entity `ItemEntity` được cập nhật reflect schema mới (chi tiết DTO/service ở [TKT-060](./TKT-060-item-entity-enhancement.md)).
- Down migration đảo ngược được (giữ data legacy nếu có thể).

## Acceptance Criteria

- [ ] Migration up chạy thành công trên DB staging replica có data legacy.
- [ ] 100% row `items` có `category != NULL` được map sang `category_id` (sau khi tạo các `inventory_item_categories` distinct).
- [ ] 100% row `items` có `provider_id != NULL` được sang `item_providers` với `is_primary = true`.
- [ ] Migration down khôi phục `items.category` (string) và `items.provider_id` từ data trong bảng nối (best-effort: lấy NCC primary).
- [ ] DB constraint enforce: tối đa 1 row `is_primary = true` per item (partial unique index).
- [ ] Tất cả FK có ON DELETE policy hợp lý (xem Tech Approach).

## Definition of Done

- [ ] PR có migration + 3 entity file + cập nhật `ItemEntity`; pass CI lint + build.
- [ ] Migration test trên staging replica, snapshot DB trước/sau.
- [ ] Đã thử rollback (down) trên staging.
- [ ] Docstring entity rõ ý nghĩa cột và unique constraint.

## Tech Approach

### Alter `items`

```sql
ALTER TABLE items ADD COLUMN category_id     UUID NULL REFERENCES inventory_item_categories(id);
ALTER TABLE items ADD COLUMN is_pos_visible  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE items ADD COLUMN weight_gram     NUMERIC(18,2) NULL;
ALTER TABLE items ADD COLUMN length_cm       NUMERIC(18,2) NULL;
ALTER TABLE items ADD COLUMN width_cm        NUMERIC(18,2) NULL;
ALTER TABLE items ADD COLUMN height_cm       NUMERIC(18,2) NULL;
ALTER TABLE items ADD COLUMN manufacture_year SMALLINT NULL;
ALTER TABLE items ADD COLUMN composition     TEXT NULL;

CREATE INDEX idx_items_category_id ON items(category_id);
```

Sau data migration thành công:
```sql
ALTER TABLE items DROP COLUMN category;
ALTER TABLE items DROP COLUMN provider_id;
```

### Bảng mới `item_providers`

```sql
CREATE TABLE item_providers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  provider_id     UUID NOT NULL REFERENCES inventory_providers(id) ON DELETE RESTRICT,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID NOT NULL,
  UNIQUE (item_id, provider_id)
);
CREATE INDEX idx_item_providers_org_item ON item_providers(organization_id, item_id);
CREATE UNIQUE INDEX uq_item_providers_primary
  ON item_providers(item_id) WHERE is_primary = TRUE;
```

### Bảng mới `item_barcodes`

```sql
CREATE TABLE item_barcodes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  code            VARCHAR(100) NOT NULL,
  notes           TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID NOT NULL,
  UNIQUE (organization_id, code)
);
CREATE INDEX idx_item_barcodes_item ON item_barcodes(item_id);
```

### Bảng mới `item_stock_thresholds`

```sql
CREATE TABLE item_stock_thresholds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  min_qty         NUMERIC(18,2) NULL,
  max_qty         NUMERIC(18,2) NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID NOT NULL,
  UNIQUE (item_id, location_id)
);
CREATE INDEX idx_item_thresholds_org_loc ON item_stock_thresholds(organization_id, location_id);
```

### Data migration

1. **Category string → FK**
   ```sql
   -- Tạo categories từ giá trị distinct (trim, case-insensitive)
   INSERT INTO inventory_item_categories (id, organization_id, name, created_at, updated_at, created_by)
   SELECT DISTINCT uuid_generate_v4(), organization_id, TRIM(category), NOW(), NOW(), created_by
   FROM items
   WHERE category IS NOT NULL AND TRIM(category) != ''
   ON CONFLICT (organization_id, name) DO NOTHING;

   -- Update items.category_id
   UPDATE items i
   SET category_id = c.id
   FROM inventory_item_categories c
   WHERE c.organization_id = i.organization_id
     AND LOWER(c.name) = LOWER(TRIM(i.category));
   ```

2. **provider_id → item_providers**
   ```sql
   INSERT INTO item_providers (organization_id, item_id, provider_id, is_primary, created_by)
   SELECT organization_id, id, provider_id, TRUE, created_by
   FROM items WHERE provider_id IS NOT NULL;
   ```

3. Drop columns sau khi verify count khớp.

### Rollback (down)

- Khôi phục `items.category` (string) bằng JOIN với `inventory_item_categories`.
- Khôi phục `items.provider_id` lấy NCC `is_primary = true` (nếu nhiều primary do lỗi, lấy `MIN(created_at)`).
- DROP 3 bảng mới + 8 cột mới.

## Testing Strategy

- Migration test trên snapshot staging có data legacy thực.
- Assert: `COUNT(items WHERE category IS NOT NULL)` == `COUNT(items WHERE category_id IS NOT NULL)` sau up.
- Assert: `COUNT(items WHERE provider_id IS NOT NULL)` == `COUNT(item_providers WHERE is_primary)`.
- Rollback: down rồi up lại → schema identical.

## Dependencies

- Phụ thuộc: EPIC-003 (items, providers, item_categories, locations đã có).
- Blocks: TKT-060, TKT-061, TKT-063, TKT-064.
