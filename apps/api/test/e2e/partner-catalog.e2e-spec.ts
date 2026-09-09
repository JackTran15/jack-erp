import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
  request,
} from './setup/test-app';

const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';

// A role holding ONLY partner.catalog.read. This is the whole point of the
// feature: the key handed to a partner must not be able to reach the internal
// inventory endpoints that return purchasePrice (ADR-02).
const PARTNER_ROLE_ID = 'd0000000-0000-4000-8000-000000000091';

const CATEGORY = {
  root: 'e1000000-0000-4000-8000-000000000001',
  child: 'e1000000-0000-4000-8000-000000000002',
  grandchild: 'e1000000-0000-4000-8000-000000000003',
  sibling: 'e1000000-0000-4000-8000-000000000004',
  inactive: 'e1000000-0000-4000-8000-000000000005',
};
const PRODUCT = {
  inGrandchild: 'e2000000-0000-4000-8000-000000000001',
  inSibling: 'e2000000-0000-4000-8000-000000000002',
};
const ITEM = {
  heel38: 'e3000000-0000-4000-8000-000000000001',
  heel39: 'e3000000-0000-4000-8000-000000000002',
  sandal37: 'e3000000-0000-4000-8000-000000000003',
  retired: 'e3000000-0000-4000-8000-000000000004',
};
// A branch the seeded admin is NOT working in, used to prove that stock is
// aggregated across the whole organization rather than the current branch.
const OTHER_BRANCH_ID = 'b0000000-0000-4000-8000-000000000077';
const STORAGE_ID = 'e6000000-0000-4000-8000-000000000001';
const LOCATION_ID = 'e7000000-0000-4000-8000-000000000001';

const TREE_URL = '/v2/partner/catalog/categories/tree';
const SEARCH_URL = '/v2/partner/catalog/products/search';
const WHITELISTED_IP = '203.0.113.7';

async function ensurePermission(ds: DataSource, key: string, module: string) {
  await ds.query(
    `INSERT INTO permissions (id, key, description, module)
     VALUES (gen_random_uuid(), $1, $1, $2) ON CONFLICT DO NOTHING`,
    [key, module],
  );
}

async function grantToRole(ds: DataSource, roleId: string, key: string) {
  await ds.query(
    `INSERT INTO role_permissions (id, role_id, permission_id)
     SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
     ON CONFLICT DO NOTHING`,
    [roleId, key],
  );
}

async function seedCatalog(ds: DataSource) {
  const cat = async (id: string, code: string, name: string, parent: string | null, status = 'ACTIVE') =>
    ds.query(
      `INSERT INTO inventory_item_categories
         (id, organization_id, created_by, name, code, status, parent_group_id, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::inventory_item_category_status_enum, $7::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, SEEDED_ORG_ID, SEEDED_USER_ID, name, code, status, parent],
    );

  // GIÀY DÉP ─┬─ Giày nữ ── Giày cao gót   (products live only at the leaf)
  //           └─ Dép nữ
  await cat(CATEGORY.root, 'PC-01', 'GIÀY DÉP', null);
  await cat(CATEGORY.child, 'PC-1002', 'Giày nữ', CATEGORY.root);
  await cat(CATEGORY.grandchild, 'PC-100201', 'Giày cao gót', CATEGORY.child);
  await cat(CATEGORY.sibling, 'PC-1006', 'Dép nữ', CATEGORY.root);
  await cat(CATEGORY.inactive, 'PC-DEAD', 'Nhóm đã ngừng', null, 'INACTIVE');

  const product = async (id: string, name: string) =>
    ds.query(
      `INSERT INTO products (id, organization_id, created_by, name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, SEEDED_ORG_ID, SEEDED_USER_ID, name],
    );
  await product(PRODUCT.inGrandchild, 'Giày cao gót HHB2940');
  await product(PRODUCT.inSibling, 'Dép nữ TRUC2025');

  const item = async (
    id: string,
    code: string,
    name: string,
    productId: string,
    categoryId: string,
    price: number,
    isActive = true,
  ) =>
    ds.query(
      `INSERT INTO items
         (id, organization_id, created_by, code, name, unit, is_active,
          selling_price, purchase_price, product_id, category_id, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, 'pcs', $6, $7, 400000, $8::uuid, $9::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, SEEDED_ORG_ID, SEEDED_USER_ID, code, name, isActive, price, productId, categoryId],
    );
  await item(ITEM.heel38, 'PC-HHB2940-38', 'Giày cao gót HHB2940 (38)', PRODUCT.inGrandchild, CATEGORY.grandchild, 750000);
  await item(ITEM.heel39, 'PC-HHB2940-39', 'Giày cao gót HHB2940 (39)', PRODUCT.inGrandchild, CATEGORY.grandchild, 750000);
  await item(ITEM.sandal37, 'PC-TRUC2025-37', 'Dép nữ TRUC2025 (37)', PRODUCT.inSibling, CATEGORY.sibling, 495000);
  // Inactive variant: must never be counted, priced, or shown.
  await item(ITEM.retired, 'PC-GHOST-40', 'Ngừng bán (40)', PRODUCT.inSibling, CATEGORY.child, 999000, false);

  // ── Attributes ───────────────────────────────────────────────────────────
  // Deliberate combination: the heel exists in BA/38 and in D/39, but NEVER in
  // BA/39. Filtering colors=[BA] + sizes=[39] must therefore return nothing —
  // that is the difference between "matches the same variant" and "matches the
  // product on two unrelated variants" (AC-08).
  // Explicit ids rather than derived ones: a "clever" generator here produced a
  // uuid with 11 hex digits in the last group and every insert failed.
  const DEF: Record<string, string> = {
    [`${PRODUCT.inGrandchild}|Color`]: 'e4000000-0000-4000-8000-000000000001',
    [`${PRODUCT.inGrandchild}|Size`]: 'e4000000-0000-4000-8000-000000000002',
    [`${PRODUCT.inSibling}|Color`]: 'e4000000-0000-4000-8000-000000000003',
    [`${PRODUCT.inSibling}|Size`]: 'e4000000-0000-4000-8000-000000000004',
  };
  const OPT: Record<string, string> = {
    [`${PRODUCT.inGrandchild}|Color|BA`]: 'e5000000-0000-4000-8000-000000000001',
    [`${PRODUCT.inGrandchild}|Color|D`]: 'e5000000-0000-4000-8000-000000000002',
    [`${PRODUCT.inGrandchild}|Size|38`]: 'e5000000-0000-4000-8000-000000000003',
    [`${PRODUCT.inGrandchild}|Size|39`]: 'e5000000-0000-4000-8000-000000000004',
    [`${PRODUCT.inSibling}|Color|BA`]: 'e5000000-0000-4000-8000-000000000005',
    [`${PRODUCT.inSibling}|Size|37`]: 'e5000000-0000-4000-8000-000000000006',
  };
  const defId = (productId: string, dim: string) => DEF[`${productId}|${dim}`]!;
  const optId = (productId: string, dim: string, label: string) =>
    OPT[`${productId}|${dim}|${label}`]!;

  const attrDef = async (productId: string, name: string) =>
    ds.query(
      `INSERT INTO product_attribute_definitions
         (id, organization_id, created_by, product_id, name, sort_order, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5, 0, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [defId(productId, name), SEEDED_ORG_ID, SEEDED_USER_ID, productId, name],
    );

  const attrOpt = async (productId: string, dim: string, label: string) =>
    ds.query(
      `INSERT INTO product_attribute_options
         (id, organization_id, created_by, attribute_definition_id, value_label, sort_order, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5, 0, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [optId(productId, dim, label), SEEDED_ORG_ID, SEEDED_USER_ID, defId(productId, dim), label],
    );

  const attrValue = async (itemId: string, productId: string, dim: string, label: string) =>
    ds.query(
      `INSERT INTO item_attribute_values
         (id, organization_id, created_by, item_id, attribute_definition_id, option_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, $5::uuid, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [SEEDED_ORG_ID, SEEDED_USER_ID, itemId, defId(productId, dim), optId(productId, dim, label)],
    );

  for (const productId of [PRODUCT.inGrandchild, PRODUCT.inSibling]) {
    await attrDef(productId, 'Color');
    await attrDef(productId, 'Size');
  }
  await attrOpt(PRODUCT.inGrandchild, 'Color', 'BA');
  await attrOpt(PRODUCT.inGrandchild, 'Color', 'D');
  await attrOpt(PRODUCT.inGrandchild, 'Size', '38');
  await attrOpt(PRODUCT.inGrandchild, 'Size', '39');
  await attrOpt(PRODUCT.inSibling, 'Color', 'BA');
  await attrOpt(PRODUCT.inSibling, 'Size', '37');

  await attrValue(ITEM.heel38, PRODUCT.inGrandchild, 'Color', 'BA');
  await attrValue(ITEM.heel38, PRODUCT.inGrandchild, 'Size', '38');
  await attrValue(ITEM.heel39, PRODUCT.inGrandchild, 'Color', 'D');
  await attrValue(ITEM.heel39, PRODUCT.inGrandchild, 'Size', '39');
  await attrValue(ITEM.sandal37, PRODUCT.inSibling, 'Color', 'BA');
  await attrValue(ITEM.sandal37, PRODUCT.inSibling, 'Size', '37');

  // ── Stock ────────────────────────────────────────────────────────────────
  // `stock_balances.location_id` is a real FK to `locations`, which needs a
  // `storages` row, which in turn needs a `branches` row — so the whole chain
  // has to exist. (The dev snapshot happens to be missing this constraint,
  // which is exactly why it must be checked against the migrated schema.)
  await ds.query(
    `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
     VALUES ($1::uuid, $2, 'Chi nhánh kho xa', 'ACTIVE', false, $3, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [OTHER_BRANCH_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
  );
  await ds.query(
    `INSERT INTO storages (id, organization_id, branch_id, created_by, code, name, is_active, created_at, updated_at)
     VALUES ($1::uuid, $2, $3::uuid, $4, 'PC-STORE', 'Kho đối tác', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [STORAGE_ID, SEEDED_ORG_ID, OTHER_BRANCH_ID, SEEDED_USER_ID],
  );
  await ds.query(
    `INSERT INTO locations (id, organization_id, created_by, code, name, storage_id, type, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, 'PC-LOC', 'Kệ đối tác', $4::uuid, 'SHELF', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [LOCATION_ID, SEEDED_ORG_ID, SEEDED_USER_ID, STORAGE_ID],
  );

  // Only the heel has stock, and it sits in a branch the caller is not working
  // in — so a true `inStock` proves organization-wide aggregation (AC-12).
  await ds.query(
    `INSERT INTO stock_balances
       (id, organization_id, branch_id, created_by, item_id, location_id, quantity, is_tracked, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, $5::uuid, 5, true, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [SEEDED_ORG_ID, OTHER_BRANCH_ID, SEEDED_USER_ID, ITEM.heel38, LOCATION_ID],
  );
}

interface TreeNode {
  id: string;
  code: string | null;
  name: string;
  parentId: string | null;
  productCount: number;
  children: TreeNode[];
}

const find = (nodes: TreeNode[], id: string): TreeNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = find(node.children, id);
    if (hit) return hit;
  }
  return undefined;
};

interface ProductRow {
  id: string;
  code: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  priceMin: number;
  priceMax: number;
  colors: string[];
  sizes: string[];
  inStock: boolean;
  images: string[];
}

let app!: INestApplication;
let seed!: SeedResult;
let partnerKey!: string;
let noPermissionKey!: string;

describe('Partner catalog (E2E)', () => {
  // ONE application for the whole file. Each describe used to boot its own,
  // and the third hit Jest's 180s hook timeout before it finished starting —
  // ~2-3 minutes per boot on this stack, three times over. The suites share
  // read-only fixtures, so there is nothing to isolate by re-booting.
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    const ds = app.get(DataSource);

    await ensurePermission(ds, 'partner.catalog.read', 'partner-catalog');
    for (const key of ['api-key.read', 'api-key.create']) {
      await ensurePermission(ds, key, 'api-key');
      await grantToRole(ds, SEEDED_ROLE_ID, key);
    }
    // The seeded admin role deliberately does NOT get partner.catalog.read —
    // a key built on it is the negative case for AC-22.
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2, 'Đối tác', 'Partner integration role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PARTNER_ROLE_ID, SEEDED_ORG_ID],
    );
    await grantToRole(ds, PARTNER_ROLE_ID, 'partner.catalog.read');
    await app
      .get(RbacService)
      .invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);

    await seedCatalog(ds);

    const mintKey = async (name: string, roleId: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/admin/entities/api-keys/records')
        .set('Authorization', authHeader(seed.accessToken))
        .set('X-Branch-Id', seed.branchId)
        .send({ name, roles: [roleId], ipWhitelist: [WHITELISTED_IP] })
        .expect(201);
      return res.body.rawKey;
    };
    partnerKey = await mintKey('Partner catalog key', PARTNER_ROLE_ID);
    noPermissionKey = await mintKey('Admin-role key', SEEDED_ROLE_ID);
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('Partner catalog — category tree (E2E)', () => {
    let app!: INestApplication;
    let seed!: SeedResult;
    let partnerKey!: string;
    let noPermissionKey!: string;



    // AC-21
    it('rejects a request with no credential (401)', async () => {
      await request(app.getHttpServer()).post(TREE_URL).send({}).expect(401);
    });

    // AC-22
    it('rejects a valid key whose role lacks partner.catalog.read (403)', async () => {
      await request(app.getHttpServer())
        .post(TREE_URL)
        .set('X-Api-Key', noPermissionKey)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .send({})
        .expect(403);
    });

    it('accepts a partner key and returns the nested tree', async () => {
      const res = await request(app.getHttpServer())
        .post(TREE_URL)
        .set('X-Api-Key', partnerKey)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .send({})
        .expect(200);

      const data: TreeNode[] = res.body.data;
      const root = find(data, CATEGORY.root)!;
      expect(root).toBeDefined();
      expect(root.parentId).toBeNull();
      expect(root.children.map((c) => c.id).sort()).toEqual(
        [CATEGORY.child, CATEGORY.sibling].sort(),
      );
      expect(find(data, CATEGORY.grandchild)!.parentId).toBe(CATEGORY.child);
    });

    // AC-02 — inactive categories never reach the partner
    it('omits INACTIVE categories', async () => {
      const res = await request(app.getHttpServer())
        .post(TREE_URL)
        .set('X-Api-Key', partnerKey)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .send({})
        .expect(200);

      expect(find(res.body.data, CATEGORY.inactive)).toBeUndefined();
    });

    // AC-03 — the parent holds no items directly; it must still report its subtree
    it('rolls productCount up to a parent that holds nothing directly', async () => {
      const res = await request(app.getHttpServer())
        .post(TREE_URL)
        .set('X-Api-Key', partnerKey)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .send({})
        .expect(200);

      const data: TreeNode[] = res.body.data;
      expect(find(data, CATEGORY.grandchild)!.productCount).toBe(1);
      expect(find(data, CATEGORY.child)!.productCount).toBe(1); // 0 direct + 1 below
      expect(find(data, CATEGORY.sibling)!.productCount).toBe(1);
      expect(find(data, CATEGORY.root)!.productCount).toBe(2);
    });

    it('rejects an unknown field on the request body (400)', async () => {
      await request(app.getHttpServer())
        .post(TREE_URL)
        .set('X-Api-Key', partnerKey)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .send({ notAField: true })
        .expect(400);
    });

    it('never exposes an internal category field', async () => {
      const res = await request(app.getHttpServer())
        .post(TREE_URL)
        .set('X-Api-Key', partnerKey)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .send({})
        .expect(200);

      expect(Object.keys(res.body.data[0]).sort()).toEqual([
        'children',
        'code',
        'id',
        'name',
        'parentId',
        'productCount',
      ]);
    });
  });

  describe('Partner catalog — product search (E2E)', () => {
    let app!: INestApplication;
    let seed!: SeedResult;
    let partnerKey!: string;
    let noPermissionKey!: string;

    const search = (key: string, body: object) =>
      request(app.getHttpServer())
        .post(SEARCH_URL)
        .set('X-Api-Key', key)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .send(body);



    // AC-21 / AC-22
    it('requires a credential and the partner permission', async () => {
      await request(app.getHttpServer()).post(SEARCH_URL).send({}).expect(401);
      await search(noPermissionKey, {}).expect(403);
    });

    // AC-05 / AC-11
    it('returns the pagination envelope and the published row shape', async () => {
      const res = await search(partnerKey, {}).expect(200);

      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
      expect(res.body.total).toBe(2);

      const row: ProductRow = res.body.data.find(
        (r: ProductRow) => r.name === 'Giày cao gót HHB2940',
      );
      expect(row).toBeDefined();
      expect(row.priceMin).toBe(750000);
      expect(row.priceMax).toBe(750000);
      expect(typeof row.priceMin).toBe('number');
      expect(row.categoryName).toBe('Giày cao gót');
      expect(row.images).toEqual([]);
    });

    // AC-06 — filtering on a parent that owns no items directly
    it('matches products in child categories when filtering on the parent', async () => {
      const parent = await search(partnerKey, { categoryId: CATEGORY.root }).expect(200);
      expect(parent.body.total).toBe(2);

      const leaf = await search(partnerKey, { categoryId: CATEGORY.grandchild }).expect(200);
      expect(leaf.body.total).toBe(1);
      expect(leaf.body.data[0].name).toBe('Giày cao gót HHB2940');
    });

    it('returns nothing for a category id belonging to nobody', async () => {
      const res = await search(partnerKey, {
        categoryId: '11111111-1111-4111-8111-111111111111',
      }).expect(200);
      expect(res.body.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    // AC-09
    it('matches a keyword against name and against code', async () => {
      const byName = await search(partnerKey, { keyword: 'cao gót' }).expect(200);
      expect(byName.body.total).toBe(1);

      const bySku = await search(partnerKey, { keyword: 'PC-TRUC2025' }).expect(200);
      expect(bySku.body.total).toBe(1);
      expect(bySku.body.data[0].name).toBe('Dép nữ TRUC2025');
    });

    // Proving the filter filters: a value that cannot exist must return zero.
    it('returns zero rows for a keyword that cannot match anything', async () => {
      const res = await search(partnerKey, { keyword: 'zzz-khong-ton-tai-zzz' }).expect(200);
      expect(res.body.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    // AC-10
    it('honours the three sort modes and defaults to newest', async () => {
      const asc = await search(partnerKey, { sort: 'price_asc' }).expect(200);
      const prices = asc.body.data.map((r: ProductRow) => r.priceMin);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));

      const desc = await search(partnerKey, { sort: 'price_desc' }).expect(200);
      const descPrices = desc.body.data.map((r: ProductRow) => r.priceMax);
      expect(descPrices).toEqual([...descPrices].sort((a, b) => b - a));

      const def = await search(partnerKey, {}).expect(200);
      const newest = await search(partnerKey, { sort: 'newest' }).expect(200);
      expect(def.body.data.map((r: ProductRow) => r.id)).toEqual(
        newest.body.data.map((r: ProductRow) => r.id),
      );
    });

    // AC-14
    it('rejects malformed requests rather than ignoring them', async () => {
      await search(partnerKey, { notAField: true }).expect(400);
      await search(partnerKey, { limit: 500 }).expect(400);
      await search(partnerKey, { sort: 'popular' }).expect(400);
      await search(partnerKey, { categoryId: 'not-a-uuid' }).expect(400);
    });

    it('pages without repeating or dropping a row', async () => {
      const first = await search(partnerKey, { page: 1, limit: 1 }).expect(200);
      const second = await search(partnerKey, { page: 2, limit: 1 }).expect(200);

      expect(first.body.data).toHaveLength(1);
      expect(second.body.data).toHaveLength(1);
      expect(first.body.total).toBe(2);
      expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    });

    it('never exposes a cost price or an internal flag', async () => {
      const res = await search(partnerKey, {}).expect(200);
      expect(Object.keys(res.body.data[0]).sort()).toEqual([
        'categoryId',
        'categoryName',
        'code',
        'colors',
        'id',
        'images',
        'inStock',
        'name',
        'priceMax',
        'priceMin',
        'sizes',
      ]);
      expect(JSON.stringify(res.body)).not.toContain('400000');
    });
  });

  describe('Partner catalog — price, colour, size and stock (E2E)', () => {
    let app!: INestApplication;
    let seed!: SeedResult;
    let partnerKey!: string;

    const search = (body: object) =>
      request(app.getHttpServer())
        .post(SEARCH_URL)
        .set('X-Api-Key', partnerKey)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .send(body);



    const names = (body: { data: ProductRow[] }) =>
      body.data.map((r) => r.name).sort();

    it('reports the facet values of a product as raw ERP codes', async () => {
      const res = await search({}).expect(200);
      const heel = res.body.data.find(
        (r: ProductRow) => r.name === 'Giày cao gót HHB2940',
      );
      expect(heel.colors.sort()).toEqual(['BA', 'D']);
      expect(heel.sizes.sort()).toEqual(['38', '39']);
    });

    // AC-08 — colour matches on one variant, size on another
    it('matches colour and size only when the SAME variant satisfies both', async () => {
      // The heel exists in BA/38 and in D/39, but never in BA/39.
      const both = await search({ colors: ['BA'], sizes: ['39'] }).expect(200);
      expect(both.body.total).toBe(0);
      expect(both.body.data).toEqual([]);

      const real = await search({ colors: ['D'], sizes: ['39'] }).expect(200);
      expect(names(real.body)).toEqual(['Giày cao gót HHB2940']);
    });

    it('treats several values of one dimension as alternatives', async () => {
      const res = await search({ colors: ['BA'] }).expect(200);
      expect(names(res.body)).toEqual(['Dép nữ TRUC2025', 'Giày cao gót HHB2940']);

      const sizes = await search({ sizes: ['37', '39'] }).expect(200);
      expect(names(sizes.body)).toEqual([
        'Dép nữ TRUC2025',
        'Giày cao gót HHB2940',
      ]);
    });

    it('returns nothing for a facet value that does not exist', async () => {
      const res = await search({ colors: ['ZZZ-NOT-A-COLOUR'] }).expect(200);
      expect(res.body.total).toBe(0);
    });

    // AC-07
    it('filters on the price of the variant', async () => {
      const cheap = await search({ priceTo: 500000 }).expect(200);
      expect(names(cheap.body)).toEqual(['Dép nữ TRUC2025']);

      const dear = await search({ priceFrom: 700000 }).expect(200);
      expect(names(dear.body)).toEqual(['Giày cao gót HHB2940']);

      const band = await search({ priceFrom: 400000, priceTo: 800000 }).expect(200);
      expect(names(band.body)).toEqual([
        'Dép nữ TRUC2025',
        'Giày cao gót HHB2940',
      ]);
    });

    it('returns nothing for a price band nothing falls into', async () => {
      const res = await search({ priceFrom: 90000000 }).expect(200);
      expect(res.body.total).toBe(0);
    });

    it('combines price with a facet on the same variant', async () => {
      const res = await search({ colors: ['BA'], priceTo: 500000 }).expect(200);
      expect(names(res.body)).toEqual(['Dép nữ TRUC2025']);
    });

    // AC-12 — the only stock sits in a branch the caller is not working in
    it('reports stock across the whole organization', async () => {
      const res = await search({}).expect(200);
      const heel = res.body.data.find(
        (r: ProductRow) => r.name === 'Giày cao gót HHB2940',
      );
      const sandal = res.body.data.find(
        (r: ProductRow) => r.name === 'Dép nữ TRUC2025',
      );
      expect(heel.inStock).toBe(true);
      expect(sandal.inStock).toBe(false);
    });

    it('gives the same answer whatever branch the caller names', async () => {
      const withoutHeader = await search({}).expect(200);
      const withHeader = await request(app.getHttpServer())
        .post(SEARCH_URL)
        .set('X-Api-Key', partnerKey)
        .set('X-Forwarded-For', WHITELISTED_IP)
        .set('X-Branch-Id', seed.branchId)
        .send({})
        .expect(200);

      expect(withHeader.body.data.map((r: ProductRow) => r.inStock)).toEqual(
        withoutHeader.body.data.map((r: ProductRow) => r.inStock),
      );
    });

    it('never leaks a quantity or a cost price', async () => {
      const res = await search({}).expect(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('quantity');
      expect(body).not.toContain('400000');
    });
  });
});
