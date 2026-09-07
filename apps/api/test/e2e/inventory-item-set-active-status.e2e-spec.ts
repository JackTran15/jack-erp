import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * E2E for POST /inventory/items/set-active-status — bulk "Ngừng kinh doanh" /
 * "Đang kinh doanh" from the goods list.
 *
 * Every case asserts on the ROWS AFTER THE WRITE, never on the status code. The
 * failure this guards against is silent: grid rows carry a products.id while the
 * update targets `items`, so a missing id-expansion produces HTTP 200 with
 * `updated: 0` and no error at all.
 */
describe('Inventory item bulk active status (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  const P_GROUP = 'aa000000-0000-4000-8000-0000000000d1';
  const P_SHOWROOM = 'aa000000-0000-4000-8000-0000000000d2';
  const OTHER_ORG = 'e0000000-0000-4000-8000-000000000099';

  let orphanId: string;
  let otherOrgItemId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    const org = seed.organizationId;
    const by = seed.userId;

    const makeStorage = async (name: string, isMain: boolean) => {
      const storageId = await ds
        .query(
          `INSERT INTO storages (id, organization_id, branch_id, name, code, is_main_storage, is_active, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $3, $4, true, $5::uuid, NOW(), NOW())
           RETURNING id`,
          [org, seed.branchId, name, isMain, by],
        )
        .then((r: Array<{ id: string }>) => r[0].id);
      return ds
        .query(
          `INSERT INTO locations (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4, $4, 'SHELF', true, $5::uuid, NOW(), NOW())
           RETURNING id`,
          [org, seed.branchId, storageId, `L-${name}`, by],
        )
        .then((r: Array<{ id: string }>) => r[0].id);
    };
    // is_main_storage = true is what the Showroom rule keys on.
    const showroomLocation = await makeStorage('SHOWROOM', true);

    const product = (id: string, code: string) =>
      ds.query(
        `INSERT INTO products (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $3, true, $4::uuid, NOW(), NOW())`,
        [id, org, code, by],
      );
    const variant = (productId: string | null, code: string, orgId = org) =>
      ds
        .query(
          `INSERT INTO items (id, organization_id, product_id, code, name, unit,
             purchase_price, selling_price, is_active, is_pos_visible, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $3, 'đôi', 1, 1, true, true, $4::uuid, NOW(), NOW())
           RETURNING id`,
          [orgId, productId, code, by],
        )
        .then((r: Array<{ id: string }>) => r[0].id);

    // A group of three variants, none of them in a Showroom.
    await product(P_GROUP, 'GRP');
    await variant(P_GROUP, 'GRP-1');
    await variant(P_GROUP, 'GRP-2');
    await variant(P_GROUP, 'GRP-3');

    // A group where one variant still sits in the Showroom.
    await product(P_SHOWROOM, 'SHOW');
    const blocked = await variant(P_SHOWROOM, 'SHOW-BLOCKED');
    await variant(P_SHOWROOM, 'SHOW-FREE');
    await ds.query(
      `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, is_tracked, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::uuid, 7, true, $5::uuid, NOW(), NOW())`,
      [org, seed.branchId, blocked, showroomLocation, by],
    );

    orphanId = await variant(null, 'ORPHAN');
    otherOrgItemId = await variant(null, 'OTHER-ORG', OTHER_ORG);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
  });

  const setStatus = (ids: string[], isActive: boolean) =>
    request(app.getHttpServer())
      .post('/inventory/items/set-active-status')
      .set({ Authorization: authHeader(seed.accessToken) })
      .send({ ids, isActive });

  const itemsOf = (productId: string) =>
    ds.query<Array<{ code: string; is_active: boolean }>>(
      `SELECT code, is_active FROM items WHERE product_id = $1::uuid ORDER BY code`,
      [productId],
    );
  const productActive = (productId: string) =>
    ds
      .query<Array<{ is_active: boolean }>>(
        `SELECT is_active FROM products WHERE id = $1::uuid`,
        [productId],
      )
      .then((r) => r[0]?.is_active);

  it('expands a products.id to every variant, and syncs the product flag', async () => {
    const res = await setStatus([P_GROUP], false).expect(201);
    expect(res.body).toMatchObject({ updated: 3, skipped: [] });

    // The assertion that matters: all three ITEM rows changed. A missing
    // expansion would leave these untouched while still returning 200.
    const rows = await itemsOf(P_GROUP);
    expect(rows.map((r) => r.is_active)).toEqual([false, false, false]);
    expect(await productActive(P_GROUP)).toBe(false);
  });

  it('reactivates the same group, unblocked by the Showroom rule', async () => {
    const res = await setStatus([P_GROUP], true).expect(201);
    expect(res.body).toMatchObject({ updated: 3, skipped: [] });
    const rows = await itemsOf(P_GROUP);
    expect(rows.map((r) => r.is_active)).toEqual([true, true, true]);
    expect(await productActive(P_GROUP)).toBe(true);
  });

  it('targets a single item when the id is an items.id', async () => {
    await setStatus([orphanId], false).expect(201);
    const [row] = await ds.query<Array<{ is_active: boolean }>>(
      `SELECT is_active FROM items WHERE id = $1::uuid`,
      [orphanId],
    );
    expect(row.is_active).toBe(false);
    await setStatus([orphanId], true).expect(201);
  });

  it('skips items sitting in a Showroom and still applies the rest', async () => {
    const res = await setStatus([P_SHOWROOM], false).expect(201);

    expect(res.body.updated).toBe(1);
    expect(res.body.skipped).toEqual([
      { code: 'SHOW-BLOCKED', reason: 'IN_SHOWROOM' },
    ]);

    const rows = await itemsOf(P_SHOWROOM);
    expect(rows).toEqual([
      { code: 'SHOW-BLOCKED', is_active: true }, // untouched
      { code: 'SHOW-FREE', is_active: false },
    ]);
    // The group is only half-deactivated, so the product flag must not flip —
    // otherwise the catalogue would read as discontinued while part of it sells.
    expect(await productActive(P_SHOWROOM)).toBe(true);
  });

  it('applies to a mixed batch: the clean group changes, the blocked one is reported', async () => {
    await setStatus([P_GROUP, P_SHOWROOM], true).expect(201); // reset
    const res = await setStatus([P_GROUP, P_SHOWROOM], false).expect(201);

    expect(res.body.updated).toBe(4); // 3 clean + 1 free variant
    expect(res.body.skipped).toHaveLength(1);
    expect((await itemsOf(P_GROUP)).map((r) => r.is_active)).toEqual([
      false,
      false,
      false,
    ]);
    await setStatus([P_GROUP, P_SHOWROOM], true).expect(201); // reset
  });

  it('never touches an item belonging to another organization', async () => {
    const res = await setStatus([otherOrgItemId], false).expect(201);
    expect(res.body).toMatchObject({ updated: 0, skipped: [] });
    const [row] = await ds.query<Array<{ is_active: boolean }>>(
      `SELECT is_active FROM items WHERE id = $1::uuid`,
      [otherOrgItemId],
    );
    expect(row.is_active).toBe(true);
  });

  it('rejects an empty or malformed id list', async () => {
    await setStatus([], false).expect(400);
    await request(app.getHttpServer())
      .post('/inventory/items/set-active-status')
      .set({ Authorization: authHeader(seed.accessToken) })
      .send({ ids: ['not-a-uuid'], isActive: false })
      .expect(400);
  });

  it('replays a repeated request with the same idempotency key instead of writing twice', async () => {
    const key = 'e2e-set-active-status-key';
    const send = () =>
      request(app.getHttpServer())
        .post('/inventory/items/set-active-status')
        .set({
          Authorization: authHeader(seed.accessToken),
          'X-Idempotency-Key': key,
        })
        .send({ ids: [P_GROUP], isActive: false });

    const first = await send().expect(201);
    expect(first.body.updated).toBe(3);

    // Flip the rows back behind the API's back; a genuine second write would
    // set them to false again, a replay leaves them alone.
    await ds.query(`UPDATE items SET is_active = true WHERE product_id = $1::uuid`, [
      P_GROUP,
    ]);

    const second = await send().expect(201);
    expect(second.headers['x-idempotency-status']).toBe('REPLAYED');
    expect(second.body).toEqual(first.body);
    const rows = await itemsOf(P_GROUP);
    expect(rows.map((r) => r.is_active)).toEqual([true, true, true]);
  });
});
