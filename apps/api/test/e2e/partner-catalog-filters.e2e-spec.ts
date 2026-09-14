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

// This suite is deliberately its own file, not appended to
// partner-catalog.e2e-spec.ts (T-06-04 implementation note): that file is
// concurrently owned by T-03-03/T-04-03/T-05-02, and it already has its own
// fixture that does not exercise a same-product in-stock/out-of-stock split.
// Own fixture, own app boot.

const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';

// A role holding ONLY partner.catalog.read, mirroring partner-catalog.e2e-spec.ts.
const PARTNER_ROLE_ID = 'f6000000-0000-4000-8000-000000000090';

const CATEGORY_ID = 'f6000000-0000-4000-8000-000000000001';

const PRODUCT = {
  p: 'f6000000-0000-4000-8000-000000000010',
  q: 'f6000000-0000-4000-8000-000000000011',
};
const PRODUCT_P_CODE = 'FLT-ALPHA01';
const PRODUCT_Q_CODE = 'FLT-BETA02';
const PRODUCT_P_NAME = 'Giày lọc thu hẹp ALPHA';
const PRODUCT_Q_NAME = 'Giày lọc thu hẹp BETA';

// P: (38, BA, 495000, IN stock), (39, BA, 750000, OUT of stock), (39, D, 800000, IN stock).
// Q: every active variant OUT of stock: (38, BA, 600000), (40, D, 610000).
const ITEM = {
  p38Ba: 'f6000000-0000-4000-8000-000000000020',
  p39Ba: 'f6000000-0000-4000-8000-000000000021',
  p39D: 'f6000000-0000-4000-8000-000000000022',
  q38Ba: 'f6000000-0000-4000-8000-000000000023',
  q40D: 'f6000000-0000-4000-8000-000000000024',
};

const ATTR_DEF = {
  pColor: 'f6000000-0000-4000-8000-000000000030',
  pSize: 'f6000000-0000-4000-8000-000000000031',
  qColor: 'f6000000-0000-4000-8000-000000000032',
  qSize: 'f6000000-0000-4000-8000-000000000033',
};
const ATTR_OPT = {
  pColorBa: 'f6000000-0000-4000-8000-000000000040',
  pColorD: 'f6000000-0000-4000-8000-000000000041',
  pSize38: 'f6000000-0000-4000-8000-000000000042',
  pSize39: 'f6000000-0000-4000-8000-000000000043',
  qColorBa: 'f6000000-0000-4000-8000-000000000044',
  qColorD: 'f6000000-0000-4000-8000-000000000045',
  qSize38: 'f6000000-0000-4000-8000-000000000046',
  qSize40: 'f6000000-0000-4000-8000-000000000047',
};

// Must never appear in a response body.
const PURCHASE_PRICE = 320000;

const STORAGE_ID = 'f6000000-0000-4000-8000-000000000050';
const LOCATION_ID = 'f6000000-0000-4000-8000-000000000051';

const SEARCH_URL = '/v2/partner/catalog/products/search';
const WHITELISTED_IP = '203.0.113.9';

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

async function seedFixture(ds: DataSource, branchId: string) {
  await ds.query(
    `INSERT INTO inventory_item_categories
       (id, organization_id, created_by, name, code, status, parent_group_id, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, 'Nhóm lọc thu hẹp', 'FLT-CAT', 'ACTIVE'::inventory_item_category_status_enum, NULL, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [CATEGORY_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
  );

  const product = async (id: string, code: string, name: string) =>
    ds.query(
      `INSERT INTO products (id, organization_id, created_by, code, name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, SEEDED_ORG_ID, SEEDED_USER_ID, code, name],
    );
  await product(PRODUCT.p, PRODUCT_P_CODE, PRODUCT_P_NAME);
  await product(PRODUCT.q, PRODUCT_Q_CODE, PRODUCT_Q_NAME);

  const item = async (id: string, code: string, productId: string, price: number) =>
    ds.query(
      `INSERT INTO items
         (id, organization_id, created_by, code, name, unit, is_active,
          selling_price, purchase_price, product_id, category_id, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $4, 'pcs', true, $5, $6, $7::uuid, $8::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, SEEDED_ORG_ID, SEEDED_USER_ID, code, price, PURCHASE_PRICE, productId, CATEGORY_ID],
    );
  await item(ITEM.p38Ba, `${PRODUCT_P_CODE}-38-BA`, PRODUCT.p, 495000);
  await item(ITEM.p39Ba, `${PRODUCT_P_CODE}-39-BA`, PRODUCT.p, 750000);
  await item(ITEM.p39D, `${PRODUCT_P_CODE}-39-D`, PRODUCT.p, 800000);
  await item(ITEM.q38Ba, `${PRODUCT_Q_CODE}-38-BA`, PRODUCT.q, 600000);
  await item(ITEM.q40D, `${PRODUCT_Q_CODE}-40-D`, PRODUCT.q, 610000);

  const attrDef = async (id: string, productId: string, name: string) =>
    ds.query(
      `INSERT INTO product_attribute_definitions
         (id, organization_id, created_by, product_id, name, sort_order, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5, 0, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, SEEDED_ORG_ID, SEEDED_USER_ID, productId, name],
    );
  await attrDef(ATTR_DEF.pColor, PRODUCT.p, 'Color');
  await attrDef(ATTR_DEF.pSize, PRODUCT.p, 'Size');
  await attrDef(ATTR_DEF.qColor, PRODUCT.q, 'Color');
  await attrDef(ATTR_DEF.qSize, PRODUCT.q, 'Size');

  const attrOpt = async (id: string, defId: string, label: string) =>
    ds.query(
      `INSERT INTO product_attribute_options
         (id, organization_id, created_by, attribute_definition_id, value_label, sort_order, created_at, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5, 0, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, SEEDED_ORG_ID, SEEDED_USER_ID, defId, label],
    );
  await attrOpt(ATTR_OPT.pColorBa, ATTR_DEF.pColor, 'BA');
  await attrOpt(ATTR_OPT.pColorD, ATTR_DEF.pColor, 'D');
  await attrOpt(ATTR_OPT.pSize38, ATTR_DEF.pSize, '38');
  await attrOpt(ATTR_OPT.pSize39, ATTR_DEF.pSize, '39');
  await attrOpt(ATTR_OPT.qColorBa, ATTR_DEF.qColor, 'BA');
  await attrOpt(ATTR_OPT.qColorD, ATTR_DEF.qColor, 'D');
  await attrOpt(ATTR_OPT.qSize38, ATTR_DEF.qSize, '38');
  await attrOpt(ATTR_OPT.qSize40, ATTR_DEF.qSize, '40');

  const attrValue = async (itemId: string, defId: string, optId: string) =>
    ds.query(
      `INSERT INTO item_attribute_values
         (id, organization_id, created_by, item_id, attribute_definition_id, option_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, $5::uuid, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [SEEDED_ORG_ID, SEEDED_USER_ID, itemId, defId, optId],
    );
  await attrValue(ITEM.p38Ba, ATTR_DEF.pColor, ATTR_OPT.pColorBa);
  await attrValue(ITEM.p38Ba, ATTR_DEF.pSize, ATTR_OPT.pSize38);
  await attrValue(ITEM.p39Ba, ATTR_DEF.pColor, ATTR_OPT.pColorBa);
  await attrValue(ITEM.p39Ba, ATTR_DEF.pSize, ATTR_OPT.pSize39);
  await attrValue(ITEM.p39D, ATTR_DEF.pColor, ATTR_OPT.pColorD);
  await attrValue(ITEM.p39D, ATTR_DEF.pSize, ATTR_OPT.pSize39);
  await attrValue(ITEM.q38Ba, ATTR_DEF.qColor, ATTR_OPT.qColorBa);
  await attrValue(ITEM.q38Ba, ATTR_DEF.qSize, ATTR_OPT.qSize38);
  await attrValue(ITEM.q40D, ATTR_DEF.qColor, ATTR_OPT.qColorD);
  await attrValue(ITEM.q40D, ATTR_DEF.qSize, ATTR_OPT.qSize40);

  // stock_balances.location_id is a real FK, so the storage/location chain has
  // to exist. Reuses the branch seedBaseData() already created.
  await ds.query(
    `INSERT INTO storages (id, organization_id, branch_id, created_by, code, name, is_active, created_at, updated_at)
     VALUES ($1::uuid, $2, $3::uuid, $4, 'FLT-STORE', 'Kho lọc thu hẹp', true, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [STORAGE_ID, SEEDED_ORG_ID, branchId, SEEDED_USER_ID],
  );
  await ds.query(
    `INSERT INTO locations (id, organization_id, created_by, code, name, storage_id, type, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, 'FLT-LOC', 'Kệ lọc thu hẹp', $4::uuid, 'SHELF', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [LOCATION_ID, SEEDED_ORG_ID, SEEDED_USER_ID, STORAGE_ID],
  );

  const stock = async (itemId: string, quantity: number) =>
    ds.query(
      `INSERT INTO stock_balances
         (id, organization_id, branch_id, created_by, item_id, location_id, quantity, is_tracked, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4::uuid, $5::uuid, $6, true, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [SEEDED_ORG_ID, branchId, SEEDED_USER_ID, itemId, LOCATION_ID, quantity],
    );
  await stock(ITEM.p38Ba, 5);
  await stock(ITEM.p39D, 3);
  // Out of stock, but WITH a stock_balances row of quantity 0 — proves
  // `quantity > 0` is required, not merely the presence of a balance row.
  await stock(ITEM.p39Ba, 0);
  // Q's variants have no stock_balances row at all: also out of stock, by a
  // different route (no row rather than a zero-quantity row).
}

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

const FULL_P_ROW = {
  colors: ['BA', 'D'],
  sizes: ['38', '39'],
  priceMin: 495000,
  priceMax: 800000,
  inStock: true,
};

const rowOf = (
  body: { data: ProductRow[] },
  name: string,
): ProductRow | undefined => body.data.find((r) => r.name === name);

let app!: INestApplication;
let seed!: SeedResult;
let partnerKey!: string;

describe('Partner catalog — variant-level filters and inStock rows (E2E)', () => {
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

    await seedFixture(ds, seed.branchId);

    const res = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'Partner filter key',
        roles: [PARTNER_ROLE_ID],
        ipWhitelist: [WHITELISTED_IP],
      })
      .expect(201);
    partnerKey = res.body.rawKey;
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  const search = (body: object) =>
    request(app.getHttpServer())
      .post(SEARCH_URL)
      .set('X-Api-Key', partnerKey)
      .set('X-Forwarded-For', WHITELISTED_IP)
      .send(body);

  const totalFor = async (body: object): Promise<number> =>
    (await search(body).expect(200)).body.total;

  describe('AC-23 — the row describes only the variants that matched', () => {
    it('narrows to the BA variants: both sizes, both prices, still in stock', async () => {
      const res = await search({ colors: ['BA'] }).expect(200);
      expect(rowOf(res.body, PRODUCT_P_NAME)).toMatchObject({
        colors: ['BA'],
        sizes: ['38', '39'],
        priceMin: 495000,
        priceMax: 750000,
        inStock: true,
      });
    });

    it('narrows to the single BA/39 variant, which is out of stock', async () => {
      const res = await search({ colors: ['BA'], sizes: ['39'] }).expect(200);
      expect(rowOf(res.body, PRODUCT_P_NAME)).toMatchObject({
        colors: ['BA'],
        sizes: ['39'],
        priceMin: 750000,
        priceMax: 750000,
        inStock: false,
      });
    });

    it('narrows to every size-39 variant across both colours', async () => {
      const res = await search({ sizes: ['39'] }).expect(200);
      expect(rowOf(res.body, PRODUCT_P_NAME)).toMatchObject({
        colors: ['BA', 'D'],
        sizes: ['39'],
        priceMin: 750000,
        priceMax: 800000,
        inStock: true,
      });
    });

    it('narrows to the one variant inside a price band', async () => {
      const res = await search({ priceFrom: 700000, priceTo: 760000 }).expect(200);
      expect(rowOf(res.body, PRODUCT_P_NAME)).toMatchObject({
        colors: ['BA'],
        sizes: ['39'],
        priceMin: 750000,
        priceMax: 750000,
        inStock: false,
      });
    });

    it('describes every active variant when no variant-level filter is present', async () => {
      const res = await search({}).expect(200);
      expect(rowOf(res.body, PRODUCT_P_NAME)).toMatchObject(FULL_P_ROW);
    });

    it('lets keyword and categoryId select the product without narrowing its row', async () => {
      const byKeyword = await search({ keyword: 'ALPHA01' }).expect(200);
      expect(byKeyword.body.total).toBe(1);
      expect(rowOf(byKeyword.body, PRODUCT_P_NAME)).toMatchObject(FULL_P_ROW);

      const byCategory = await search({ categoryId: CATEGORY_ID }).expect(200);
      expect(byCategory.body.total).toBe(2);
      expect(rowOf(byCategory.body, PRODUCT_P_NAME)).toMatchObject(FULL_P_ROW);
    });

    it('sorts by the narrowed price, not the full range, once a filter is applied', async () => {
      // Unfiltered: P's full range starts at 495000, Q's at 600000 — P first.
      const unfiltered = await search({ sort: 'price_asc' }).expect(200);
      expect(unfiltered.body.data.map((r: ProductRow) => r.name)).toEqual([
        PRODUCT_P_NAME,
        PRODUCT_Q_NAME,
      ]);

      // Under colors=['D'], P narrows to its 800000 variant and Q to its
      // 610000 one — the ascending order flips relative to the unfiltered case,
      // which is only possible if the sort reads the narrowed price.
      const narrowedAsc = await search({ colors: ['D'], sort: 'price_asc' }).expect(200);
      expect(narrowedAsc.body.data.map((r: ProductRow) => r.name)).toEqual([
        PRODUCT_Q_NAME,
        PRODUCT_P_NAME,
      ]);
      expect(rowOf(narrowedAsc.body, PRODUCT_P_NAME)!.priceMin).toBe(800000);
      expect(rowOf(narrowedAsc.body, PRODUCT_Q_NAME)!.priceMin).toBe(610000);

      const narrowedDesc = await search({ colors: ['D'], sort: 'price_desc' }).expect(200);
      expect(narrowedDesc.body.data.map((r: ProductRow) => r.name)).toEqual([
        PRODUCT_P_NAME,
        PRODUCT_Q_NAME,
      ]);
    });

    // Closes a T-03-03 review follow-up: price and colour must narrow to the
    // SAME variant, not be applied as independent product-level predicates.
    it('narrows price and colour to the same variant', async () => {
      const res = await search({ colors: ['BA'], priceTo: 600000 }).expect(200);
      const row = rowOf(res.body, PRODUCT_P_NAME);
      expect(row).toBeDefined();
      expect(row!.priceMin).toBe(495000);
      expect(row!.priceMax).toBe(495000);
    });

    it('excludes both P and Q when no variant satisfies colour AND price together', async () => {
      // P's only D variant is 800000; Q's only D variant is 610000 — both over
      // the 600000 ceiling, so neither product has a D variant in the band.
      const res = await search({ colors: ['D'], priceTo: 600000 }).expect(200);
      expect(res.body.total).toBe(0);
      expect(rowOf(res.body, PRODUCT_P_NAME)).toBeUndefined();
      expect(rowOf(res.body, PRODUCT_Q_NAME)).toBeUndefined();
    });
  });

  describe('AC-24 — inStock filters on the same variant as colors/sizes/price', () => {
    it('inStock=true selects P (has a matching variant with stock) and excludes Q', async () => {
      const res = await search({ inStock: true }).expect(200);
      const names = res.body.data.map((r: ProductRow) => r.name);
      expect(names).toContain(PRODUCT_P_NAME);
      expect(names).not.toContain(PRODUCT_Q_NAME);
      expect(res.body.data.every((r: ProductRow) => r.inStock === true)).toBe(true);
    });

    it('inStock=false selects Q (every variant out of stock) and excludes P', async () => {
      const res = await search({ inStock: false }).expect(200);
      const names = res.body.data.map((r: ProductRow) => r.name);
      expect(names).toContain(PRODUCT_Q_NAME);
      expect(names).not.toContain(PRODUCT_P_NAME);
      expect(res.body.data.every((r: ProductRow) => r.inStock === false)).toBe(true);
    });

    it('excludes P under colors BA + sizes 39 + inStock=true, since that variant is out of stock', async () => {
      const res = await search({ colors: ['BA'], sizes: ['39'], inStock: true }).expect(200);
      expect(res.body.total).toBe(0);
      expect(rowOf(res.body, PRODUCT_P_NAME)).toBeUndefined();
    });

    it('includes P under colors BA + sizes 39 + inStock=false, reporting that variant as out of stock', async () => {
      const res = await search({ colors: ['BA'], sizes: ['39'], inStock: false }).expect(200);
      const row = rowOf(res.body, PRODUCT_P_NAME);
      expect(row).toBeDefined();
      expect(row!.inStock).toBe(false);
      expect(row!.priceMin).toBe(750000);
      expect(row!.priceMax).toBe(750000);
    });

    it('keeps total(inStock=true) + total(inStock=false) = total(inStock omitted)', async () => {
      const cases: object[] = [
        {},
        { colors: ['BA'], sizes: ['39'] },
        { priceFrom: 490000, priceTo: 800000 },
        { categoryId: CATEGORY_ID },
      ];
      for (const filters of cases) {
        const [omitted, whenTrue, whenFalse] = await Promise.all([
          totalFor(filters),
          totalFor({ ...filters, inStock: true }),
          totalFor({ ...filters, inStock: false }),
        ]);
        expect(whenTrue + whenFalse).toBe(omitted);
      }
    });
  });

  // AC-14
  describe('inStock validation', () => {
    it('rejects a string value even when it reads as a boolean', async () => {
      await search({ inStock: 'yes' }).expect(400);
      await search({ inStock: 'true' }).expect(400);
    });

    it('accepts a real boolean', async () => {
      await search({ inStock: true }).expect(200);
    });
  });

  describe('response hygiene', () => {
    it('never exposes the internal matchedItemIds field or a cost price', async () => {
      const unfiltered = await search({}).expect(200);
      const filtered = await search({ colors: ['BA'], sizes: ['39'] }).expect(200);

      for (const res of [unfiltered, filtered]) {
        const body = JSON.stringify(res.body);
        expect(body).not.toContain('matchedItemIds');
        expect(body).not.toContain(String(PURCHASE_PRICE));
        for (const row of res.body.data as ProductRow[]) {
          expect(Object.keys(row)).not.toContain('matchedItemIds');
        }
      }
    });
  });
});
