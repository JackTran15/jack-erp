# TKT-KM-02 Migration 7 bảng + DocumentType.PROMOTION + permissions

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Dựng schema chuẩn hóa cho CTKM: 7 bảng mới + 12 pg enum, thêm `DocumentType.PROMOTION` (prefix `KM`) để auto-sinh mã chương trình, và 3 permission key mới. Bảng `promotions` cũ (jsonb) **không đụng tới**. Đây là nền cho toàn epic.

## Deliverables

**Ba migration viết tay, tách file** (`migrationsTransactionMode: 'each'` trong `data-source.ts` — mỗi file là 1 transaction riêng; `ALTER TYPE ... ADD VALUE` rồi dùng ngay giá trị mới trong cùng transaction sẽ nổ `55P04`):

- `apps/api/src/database/migrations/<ts>-AddPromotionToDocumentTypeEnum.ts` — chỉ một câu:
  ```sql
  ALTER TYPE "document_number_rules_document_type_enum" ADD VALUE IF NOT EXISTS 'PROMOTION'
  ```
  Theo đúng mẫu `1780400000000-AddGoodsReceiptToDocumentTypeEnum.ts`. `down()` để trống kèm comment — Postgres không gỡ được giá trị enum.
- `apps/api/src/database/migrations/<ts+1>-AddPromotionProgramTables.ts` — `CREATE TYPE` (12 enum) + `CREATE TABLE` (7 bảng) + index.
- `apps/api/src/database/migrations/<ts+2>-SeedPromotionPermissions.ts` — chỉ nếu permission cần ghi DB; kiểm tra trước: `PermissionSyncService` đồng bộ `PERMISSION_DEFINITIONS` lúc boot, nếu vậy **bỏ migration này** và chỉ sửa seed file.

**Enum (pg):**

| Enum | Giá trị |
| ---- | ------- |
| `promotion_program_type_enum` | `INVOICE_DISCOUNT` `ITEM_DISCOUNT` `TIERED_DISCOUNT` `GIFT_ITEM` `BUY_M_GET_N` |
| `promotion_status_enum` | `TRACKING` `STOPPED` |
| `promotion_apply_to_enum` | `ALL_CUSTOMERS` `CUSTOMER_GROUP` `BIRTHDAY` `CARD_TIER` |
| `promotion_birthday_match_enum` | `EXACT_DAY` `SAME_WEEK` `SAME_MONTH` |
| `promotion_discount_mode_enum` | `PERCENT` `AMOUNT` `FIXED_PRICE` |
| `promotion_invoice_scope_enum` | `NON_PROMO_ONLY` `ALL_ITEMS` |
| `promotion_tier_basis_enum` | `QUANTITY` `ITEM_VALUE` `INVOICE_VALUE` |
| `promotion_tier_scope_enum` | `PER_ITEM` `ALL_ITEMS_IN_GROUP` |
| `promotion_target_type_enum` | `PRODUCT` `ITEM` `CATEGORY` |
| `promotion_gift_mode_enum` | `ONE_OF` `ALL_OF` |
| `promotion_buy_get_policy_enum` | `SPECIFIC` `CHEAPEST` |
| `promotion_line_role_enum` | `CONDITION` `REWARD` |
| `promotion_condition_type_enum` | `NONE` `MIN_INVOICE_AMOUNT` `SPECIFIC_QUANTITY` |
| `promotion_calc_basis_enum` | `ALL_ITEMS` `NON_PROMO_ITEMS` `ITEM_CATEGORIES` |
| `promotion_group_match_mode_enum` | `ANY` `ALL` |

**Bảng.** Mọi bảng mang cột chuẩn của `BaseEntity` (`apps/api/src/database/entities/base.entity.ts`): `id uuid PK DEFAULT uuid_generate_v4()`, `organization_id varchar NOT NULL`, `branch_id varchar NULL`, `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`, `created_by varchar NOT NULL`. Trừ 2 bảng nối (chỉ có PK ghép + `organization_id`).

`promotion_programs` — thêm `deleted_at timestamptz NULL` (soft delete):

| Cột | Kiểu | Null | Ý nghĩa |
| --- | ---- | ---- | ------- |
| `code` | varchar(20) | ✗ | `KM000001`, unique theo org |
| `name` | varchar | ✗ | FR-020 |
| `description` | text | ✓ | |
| `type` | `promotion_program_type_enum` | ✗ | immutable sau create (FR-006) |
| `status` | `promotion_status_enum` | ✗ | DEFAULT `'TRACKING'` |
| `priority` | int | ✗ | DEFAULT `100`, nhỏ = ưu tiên cao (BR-001) |
| `apply_to` | `promotion_apply_to_enum` | ✗ | DEFAULT `'ALL_CUSTOMERS'` |
| `birthday_match` | `promotion_birthday_match_enum` | ✓ | chỉ khi `apply_to = BIRTHDAY` |
| `card_tier_id` | uuid | ✓ | `membership_card_types.id`, không FK (khác module) |
| `start_date` / `end_date` | date | ✓ | null = vô thời hạn (BR-003) |
| `days_of_week` | smallint[] | ✗ | DEFAULT `'{}'`, ISO 1..7, rỗng = mọi ngày |
| `start_time` / `end_time` | time | ✓ | `end < start` = ca qua đêm (FR-022) |
| `auto_apply` | boolean | ✗ | DEFAULT `true` (FR-023) |
| `invoice_scope` | `promotion_invoice_scope_enum` | ✓ | `INVOICE_DISCOUNT` |
| `discount_mode` | `promotion_discount_mode_enum` | ✓ | |
| `discount_value` | numeric(18,2) | ✓ | giá trị đơn của `INVOICE_DISCOUNT` |
| `max_discount_amount` | numeric(18,2) | ✓ | trần giảm — `TIERED_DISCOUNT` + `INVOICE_VALUE` |
| `tier_basis` | `promotion_tier_basis_enum` | ✓ | |
| `tier_scope` | `promotion_tier_scope_enum` | ✓ | |
| `target_type` | `promotion_target_type_enum` | ✓ | đối tượng mặc định của lưới |
| `gift_mode` | `promotion_gift_mode_enum` | ✓ | |
| `buy_get_policy` | `promotion_buy_get_policy_enum` | ✓ | |
| `buy_quantity` / `gift_quantity` | int | ✓ | m / n |

Index: `UNIQUE (organization_id, code)`; `(organization_id, status, start_date, end_date)`; `(organization_id, priority)`.

`promotion_groups` — `program_id uuid NOT NULL` FK → `promotion_programs(id) ON DELETE CASCADE`, `ordinal int NOT NULL`, `name varchar NULL`. `UNIQUE (program_id, ordinal)`. Hình thức không phải `TIERED_DISCOUNT` có đúng 1 group ngầm `ordinal = 0`.

`promotion_lines` — `program_id` FK CASCADE, `group_id` FK CASCADE, `role promotion_line_role_enum NOT NULL`, `target_type promotion_target_type_enum NOT NULL`, `target_id uuid NOT NULL`, `quantity numeric(18,2) NULL`, `discount_mode` NULL, `discount_value numeric(18,2) NULL`, `max_unit_price numeric(18,2) NULL` (lưới quà tặng có cột "Giá bán ≤"), `sort_order int NOT NULL DEFAULT 0`.
**Không FK trên `target_id`** — polymorphic 3 bảng (`items` / `products` / `inventory_item_categories`). Index `(program_id)` và `(organization_id, target_type, target_id)` — cái sau là index trả lời "SKU nào đang được khuyến mại".

`promotion_tiers` — `program_id` FK CASCADE, `group_id` FK CASCADE, `from_value numeric(18,2) NOT NULL`, `to_value numeric(18,2) NULL` (null = ∞), `discount_mode NOT NULL`, `discount_value numeric(18,2) NOT NULL`, `sort_order int NOT NULL DEFAULT 0`. Index `(group_id, from_value)`.

`promotion_conditions` — `program_id uuid NOT NULL UNIQUE` FK CASCADE, `type promotion_condition_type_enum NOT NULL DEFAULT 'NONE'`, `min_amount numeric(18,2) NULL`, `calc_basis promotion_calc_basis_enum NULL`, `group_match_mode promotion_group_match_mode_enum NULL`, `multiply_gift boolean NOT NULL DEFAULT false`.
Danh sách nhóm hàng hóa của `calc_basis = ITEM_CATEGORIES` và lưới SKU-số-lượng của `type = SPECIFIC_QUANTITY` nằm ở `promotion_lines` với `role = CONDITION`.

`promotion_branches` — `program_id uuid` FK CASCADE, `branch_id uuid`, `organization_id varchar NOT NULL`. `PRIMARY KEY (program_id, branch_id)`. Rỗng = toàn chuỗi (BR-005).

`promotion_customer_groups` — `program_id uuid` FK CASCADE, `customer_group_id uuid`, `organization_id varchar NOT NULL`. `PRIMARY KEY (program_id, customer_group_id)`.

**Sửa file có sẵn:**

- `packages/shared-interfaces/src/document-numbering/index.ts` — thêm `PROMOTION = 'PROMOTION', // KM` vào cuối enum `DocumentType`.
- `apps/api/src/modules/document-numbering/document-numbering.service.ts:33` — thêm entry `PROMOTION: { prefix: 'KM', continuous: ... }` vào `DEFAULT_DOC_NUMBER_CONFIG` (bắt buộc: `Record` này phủ toàn bộ enum, thiếu key sẽ lỗi type-check).
- `apps/api/src/modules/rbac/permissions.seed.ts` — thêm vào `PERMISSION_DEFINITIONS`:
  ```ts
  { key: 'promotion.read',   module: 'promotion' },
  { key: 'promotion.write',  module: 'promotion' },
  { key: 'promotion.delete', module: 'promotion' },
  ```
- `PERMISSION_LABELS_VI` trong `@erp/shared-interfaces` — thêm label VI cho 3 key trên. **Thiếu label thì description fallback về chính key** (`permissions.seed.ts:232`).

## Acceptance Criteria

- [ ] `pnpm migration:run` sạch trên DB đang có dữ liệu (không drop, không đụng `promotions` / `discount_codes` / `invoice_promotions`).
- [ ] `pnpm migration:revert` × 3 gỡ sạch 7 bảng + 15 enum mới; chạy `migration:run` lại vẫn sạch (idempotent).
- [ ] `ALTER TYPE ... ADD VALUE` nằm ở **file migration riêng**, không chung file với bất kỳ câu nào dùng giá trị `'PROMOTION'`.
- [ ] Mọi FK con → `promotion_programs` đều `ON DELETE CASCADE`.
- [ ] Không có FK trên `promotion_lines.target_id`; có index `(organization_id, target_type, target_id)`.
- [ ] `DocumentType.PROMOTION` sinh được mã: gọi `documentNumbering.generate(DocumentType.PROMOTION, branchId, actor)` trả về `KM00001`-dạng, không ném lỗi thiếu rule (service tự tạo rule mặc định).
- [ ] 3 permission key hiện trong bảng permissions sau khi boot API, có description tiếng Việt (không phải chính key).
- [ ] Cấu trúc bảng khớp **chính xác** ERD trong `docs/26-promotion-design.md`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` và `lint` xanh.
- [ ] `synchronize` vẫn `false`; không thay đổi schema ngoài migration.
- [ ] Không có tiếng Việt trong source backend (comment migration, comment cột đều tiếng Anh).
- [ ] `pnpm migration:show` liệt kê đủ 3 migration mới ở trạng thái đã chạy.

## Tech Approach

Migration viết tay — `migration:generate` sinh drift khổng lồ trên repo này. Viết trực tiếp `CREATE TYPE` / `CREATE TABLE` theo mẫu `1778400000000-AddPromotionEntities.ts` (cùng domain, dễ đối chiếu style: dấu nháy kép quanh mọi định danh, `uuid_generate_v4()`, `TIMESTAMP WITH TIME ZONE`).

`down()` gỡ theo thứ tự ngược: drop index → drop bảng con → drop `promotion_programs` → `DROP TYPE`.

Entity TypeORM **không** thuộc ticket này — chúng nằm ở `infrastructure/entities/` của TKT-KM-06, sau khi domain model (KM-04) đã định hình. Ticket này chỉ dựng DB + hằng số dùng chung.

## Testing Strategy

- Chạy tay: `docker compose up -d` → `pnpm migration:run` → `pnpm migration:revert` ×3 → `pnpm migration:run` → `pnpm migration:show`.
- Kiểm tra bằng Adminer (`:18088`) hoặc `\d+ promotion_programs`: đúng kiểu cột, đúng default, đúng index.
- Test nhanh sinh mã: script tạm gọi `DocumentNumberingService.generate(DocumentType.PROMOTION, ...)` 2 lần → `KM00001`, `KM00002`.

## Dependencies

- Depends on: TKT-KM-01 (ERD phải chốt trước)
- Blocks: TKT-KM-03, TKT-KM-06, TKT-KM-10
