import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RbacService } from '../../../src/modules/rbac/rbac.service';

/**
 * Promotion-specific E2E seed, layered on top of `seedBaseData`.
 *
 * `seedBaseData` predates this epic, so it grants neither the three
 * `promotion.*` permissions nor a `PROMOTION` numbering rule. Without them every
 * write is a 403 and `create` cannot mint a `KM…` code — which looks like a bug
 * in the feature rather than a gap in the fixture. Kept here instead of widening
 * `seedBaseData` so the promotion suites carry their own prerequisites and other
 * suites stay untouched.
 *
 * The catalogue is deliberately shaped around the acceptance criteria rather
 * than being generic: prices 685 000 / 100 000 / 200 000 / 300 000 are the exact
 * numbers AC-01 and AC-09 are stated in, and the two-level category tree is what
 * AC-25 (a promotion on a parent group reaching child items) needs.
 */

export const PROMO_IDS = {
  /** Parent category — a promotion placed here must reach items in the child. */
  parentCategoryId: 'e1000000-0000-4000-8000-000000000001',
  childCategoryId: 'e1000000-0000-4000-8000-000000000002',
  /** Sits outside the tree above, so "category did not match" is testable. */
  otherCategoryId: 'e1000000-0000-4000-8000-000000000003',

  /** 685 000 — the SKU AC-01 is written against. */
  item685: 'e2000000-0000-4000-8000-000000000001',
  /** 100 000 / 200 000 / 300 000 — the cart AC-09 (CHEAPEST) is written against. */
  item100: 'e2000000-0000-4000-8000-000000000002',
  item200: 'e2000000-0000-4000-8000-000000000003',
  item300: 'e2000000-0000-4000-8000-000000000004',
  /** Belongs to `otherCategoryId`, for the group-match-mode cases. */
  itemOther: 'e2000000-0000-4000-8000-000000000005',
} as const;

export interface PromotionSeedResult {
  parentCategoryId: string;
  childCategoryId: string;
  otherCategoryId: string;
  items: {
    id: string;
    code: string;
    sellingPrice: number;
  }[];
}

const ITEMS = [
  { id: PROMO_IDS.item685, code: 'SKU-685', name: 'Giày nữ 685', price: 685_000, child: true },
  { id: PROMO_IDS.item100, code: 'SKU-100', name: 'Phụ kiện 100', price: 100_000, child: true },
  { id: PROMO_IDS.item200, code: 'SKU-200', name: 'Phụ kiện 200', price: 200_000, child: true },
  { id: PROMO_IDS.item300, code: 'SKU-300', name: 'Phụ kiện 300', price: 300_000, child: true },
  { id: PROMO_IDS.itemOther, code: 'SKU-OTHER', name: 'Hàng nhóm khác', price: 50_000, child: false },
];

/**
 * Grants `promotion.read/write/delete` to the seeded admin role and registers a
 * `PROMOTION` numbering rule, then builds the catalogue described above.
 *
 * Idempotent — safe to call from several suites against the same database.
 */
export async function seedPromotionFixtures(
  app: INestApplication,
  base: { organizationId: string; userId: string },
): Promise<PromotionSeedResult> {
  const ds = app.get(DataSource);
  const { organizationId: orgId, userId } = base;

  // The seeded admin role is matched by name because `seedBaseData` owns its id.
  const [role] = await ds.query<{ id: string }[]>(
    `SELECT id FROM roles WHERE organization_id = $1::uuid AND name = 'admin' LIMIT 1`,
    [orgId],
  );

  for (const key of ['promotion.read', 'promotion.write', 'promotion.delete']) {
    await ds.query(
      `INSERT INTO permissions (id, key, description, module)
       VALUES (gen_random_uuid(), $1, $1, 'promotion')
       ON CONFLICT DO NOTHING`,
      [key],
    );
    if (role) {
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [role.id, key],
      );
    }
  }

  // `RbacService` caches the resolved permission set in Redis for 300s under
  // `perms:<userId>:<orgId>`. `resetDatabase` truncates Postgres and leaves Redis
  // untouched, so without this the guard answers 403 off a permission set cached
  // by an earlier run — the grants above are in the database and simply not read.
  await app.get(RbacService).invalidateUserPermissions(userId, orgId);

  // `include_date = false`: the AC talk about codes shaped `KM000001`, and a date
  // segment would make them unstable across runs.
  await ds.query(
    `INSERT INTO document_number_rules
       (id, organization_id, document_type, prefix, include_date, date_format,
        sequence_length, reset_policy, is_active, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'PROMOTION', 'KM', false, 'YYYYMMDD', 6, 'NEVER', true, $2::uuid, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [orgId, userId],
  );

  await ds.query(
    `INSERT INTO inventory_item_categories (id, organization_id, name, code, status, created_by, created_at, updated_at)
     VALUES ($1::uuid, $2, 'Giày dép', 'CAT-PARENT', 'ACTIVE', $3, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [PROMO_IDS.parentCategoryId, orgId, userId],
  );
  await ds.query(
    `INSERT INTO inventory_item_categories (id, organization_id, name, code, status, parent_group_id, created_by, created_at, updated_at)
     VALUES ($1::uuid, $2, 'Giày nữ', 'CAT-CHILD', 'ACTIVE', $3::uuid, $4, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [PROMO_IDS.childCategoryId, orgId, PROMO_IDS.parentCategoryId, userId],
  );
  await ds.query(
    `INSERT INTO inventory_item_categories (id, organization_id, name, code, status, created_by, created_at, updated_at)
     VALUES ($1::uuid, $2, 'Nhóm khác', 'CAT-OTHER', 'ACTIVE', $3, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [PROMO_IDS.otherCategoryId, orgId, userId],
  );

  for (const item of ITEMS) {
    await ds.query(
      `INSERT INTO items (id, organization_id, code, name, unit, selling_price, category_id, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, 'Cái', $5, $6::uuid, true, $7, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        item.id,
        orgId,
        item.code,
        item.name,
        item.price,
        item.child ? PROMO_IDS.childCategoryId : PROMO_IDS.otherCategoryId,
        userId,
      ],
    );
  }

  return {
    parentCategoryId: PROMO_IDS.parentCategoryId,
    childCategoryId: PROMO_IDS.childCategoryId,
    otherCategoryId: PROMO_IDS.otherCategoryId,
    items: ITEMS.map((i) => ({ id: i.id, code: i.code, sellingPrice: i.price })),
  };
}

/**
 * Minimal valid create body per promotion type.
 *
 * `CreatePromotionV2Dto` is one flat DTO covering all five types with
 * `forbidNonWhitelisted: true`, so each type may only carry its own fields —
 * sending an extra one is a 400 that reads like a validation bug.
 */
export function invoiceDiscountBody(overrides: Record<string, unknown> = {}) {
  return {
    type: 'INVOICE_DISCOUNT',
    name: 'Giảm giá hóa đơn 10%',
    applyTo: 'ALL_CUSTOMERS',
    invoiceScope: 'ALL_ITEMS',
    discountMode: 'PERCENT',
    discountValue: 10,
    autoApply: true,
    priority: 100,
    // `groups` is required even here: an invoice-level discount owns no reward
    // grid, but the aggregate always carries one implicit group (ordinal 0).
    // Mirrors what the backoffice mapper actually sends.
    groups: [{ ordinal: 0, lines: [] }],
    ...overrides,
  };
}

export function itemDiscountBody(
  targetId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: 'ITEM_DISCOUNT',
    name: 'Giảm giá hàng hóa 30%',
    applyTo: 'ALL_CUSTOMERS',
    autoApply: true,
    priority: 100,
    groups: [
      {
        ordinal: 0,
        lines: [
          {
            role: 'REWARD',
            targetType: 'ITEM',
            targetId,
            discountMode: 'PERCENT',
            discountValue: 30,
            sortOrder: 0,
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function tieredDiscountBody(
  targetId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: 'TIERED_DISCOUNT',
    name: 'Giảm giá theo mức',
    applyTo: 'ALL_CUSTOMERS',
    autoApply: true,
    priority: 100,
    tierBasis: 'QUANTITY',
    tierScope: 'PER_ITEM',
    groups: [
      {
        ordinal: 0,
        lines: [
          { role: 'REWARD', targetType: 'ITEM', targetId, sortOrder: 0 },
        ],
        tiers: [
          { fromValue: 5, toValue: 9, discountMode: 'PERCENT', discountValue: 10, sortOrder: 0 },
          { fromValue: 10, discountMode: 'PERCENT', discountValue: 20, sortOrder: 1 },
        ],
      },
    ],
    ...overrides,
  };
}

export function giftItemBody(
  giftItemId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: 'GIFT_ITEM',
    name: 'Tặng hàng hóa',
    applyTo: 'ALL_CUSTOMERS',
    autoApply: true,
    priority: 100,
    giftMode: 'ALL_OF',
    groups: [
      {
        ordinal: 0,
        lines: [
          { role: 'REWARD', targetType: 'ITEM', targetId: giftItemId, quantity: 1, sortOrder: 0 },
        ],
      },
    ],
    condition: {
      type: 'MIN_INVOICE_AMOUNT',
      minAmount: 200_000,
      calcBasis: 'ALL_ITEMS',
      multiplyGift: true,
    },
    ...overrides,
  };
}

export function buyMGetNBody(
  conditionItemIds: string[],
  overrides: Record<string, unknown> = {},
) {
  return {
    type: 'BUY_M_GET_N',
    name: 'Mua 3 tặng 1 rẻ nhất',
    applyTo: 'ALL_CUSTOMERS',
    autoApply: true,
    priority: 100,
    buyGetPolicy: 'CHEAPEST',
    buyQuantity: 3,
    giftQuantity: 1,
    groups: [
      {
        ordinal: 0,
        lines: conditionItemIds.map((targetId, index) => ({
          role: 'CONDITION',
          targetType: 'ITEM',
          targetId,
          sortOrder: index,
        })),
      },
    ],
    ...overrides,
  };
}
