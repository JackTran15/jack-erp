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
 * E2E for the "Trạng thái hết hàng" filter on POST /v2/inventory-items/search.
 *
 * The handler builds its predicate as raw SQL, so the unit spec can only assert
 * on the generated string — it cannot tell a correct SUM from an incorrect one.
 * These cases run against a real database and are the only proof that:
 *   - variant quantities are summed SIGNED (-1 and +1 cancel to 0);
 *   - a group with no stock_balances row at all counts as 0;
 *   - the sum is scoped to ONE branch, so the same catalogue gives different
 *     answers in different branches.
 */
describe('Inventory item out-of-stock filter (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  const BRANCH_B = 'b0000000-0000-4000-8000-0000000000b2';

  // Cancelling: -1 + 1 = 0  → out of stock (the rule stated by the user)
  const P_CANCEL = 'aa000000-0000-4000-8000-0000000000c1';
  // In stock at branch A (+5), nothing at branch B → out of stock only at B
  const P_STOCKED = 'aa000000-0000-4000-8000-0000000000c2';
  // Never stocked anywhere → out of stock
  const P_NEVER = 'aa000000-0000-4000-8000-0000000000c3';
  // Negative total → out of stock
  const P_NEGATIVE = 'aa000000-0000-4000-8000-0000000000c4';

  let locationA: string;
  let locationB: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    const org = seed.organizationId;
    const by = seed.userId;

    // A second branch, so "scoped to one branch" is falsifiable. The user must
    // be assigned to it or X-Branch-Id is ignored (ActorContext drops a header
    // branch that is not in the JWT's branchIds).
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Branch B', 'ACTIVE', false, $3::uuid, NOW(), NOW())`,
      [BRANCH_B, org, by],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_at, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, NOW(), $1::uuid)`,
      [by, BRANCH_B, org],
    );

    const makeStorageAndLocation = async (branchId: string, tag: string) => {
      const storageId = await ds
        .query(
          `INSERT INTO storages (id, organization_id, branch_id, name, code, is_main_storage, is_active, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $3, false, true, $4::uuid, NOW(), NOW())
           RETURNING id`,
          [org, branchId, `WH-${tag}`, by],
        )
        .then((r: Array<{ id: string }>) => r[0].id);
      return ds
        .query(
          `INSERT INTO locations (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4, $4, 'SHELF', true, $5::uuid, NOW(), NOW())
           RETURNING id`,
          [org, branchId, storageId, `LOC-${tag}`, by],
        )
        .then((r: Array<{ id: string }>) => r[0].id);
    };
    locationA = await makeStorageAndLocation(seed.branchId, 'A');
    locationB = await makeStorageAndLocation(BRANCH_B, 'B');

    const product = (id: string, code: string) =>
      ds.query(
        `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $3, $4::uuid, NOW(), NOW())`,
        [id, org, code, by],
      );
    const variant = (productId: string | null, code: string) =>
      ds
        .query(
          `INSERT INTO items (id, organization_id, product_id, code, name, unit,
             purchase_price, selling_price, is_active, is_pos_visible, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $3, 'đôi', 1, 1, true, true, $4::uuid, NOW(), NOW())
           RETURNING id`,
          [org, productId, code, by],
        )
        .then((r: Array<{ id: string }>) => r[0].id);
    const balance = (
      itemId: string,
      branchId: string,
      locationId: string,
      quantity: number,
    ) =>
      ds.query(
        `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, is_tracked, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::uuid, $5, true, $6::uuid, NOW(), NOW())`,
        [org, branchId, itemId, locationId, quantity, by],
      );

    await product(P_CANCEL, 'CANCEL');
    const c1 = await variant(P_CANCEL, 'CANCEL-1');
    const c2 = await variant(P_CANCEL, 'CANCEL-2');
    await balance(c1, seed.branchId, locationA, -1);
    await balance(c2, seed.branchId, locationA, 1);

    await product(P_STOCKED, 'STOCKED');
    const s1 = await variant(P_STOCKED, 'STOCKED-1');
    await balance(s1, seed.branchId, locationA, 5);

    await product(P_NEVER, 'NEVER');
    await variant(P_NEVER, 'NEVER-1');

    await product(P_NEGATIVE, 'NEGATIVE');
    const n1 = await variant(P_NEGATIVE, 'NEGATIVE-1');
    await balance(n1, seed.branchId, locationA, -3);

    // Orphan item (no product) with zero stock — the CTE's second arm.
    await variant(null, 'ORPHAN-ZERO');

    // Re-login LAST. The token minted by seedBaseData carries a `branchIds`
    // claim from before Branch B existed, and ActorContext discards an
    // X-Branch-Id that is not in that claim — so without this the branch header
    // is silently ignored and both branches return branch A's numbers.
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password123',
        organizationId: org,
      })
      .expect(200);
    seed = { ...seed, accessToken: relogin.body.accessToken };
  }, 300_000);

  afterAll(async () => {
    await app?.close();
  });

  const search = (body: Record<string, unknown>, token = seed.accessToken) =>
    request(app.getHttpServer())
      .post('/v2/inventory-items/search')
      .set({ Authorization: authHeader(token) })
      .send(body);

  const codes = (body: { data: Array<{ code: string }> }) =>
    body.data.map((r) => r.code).sort();

  it('returns every group when the filter is off', async () => {
    const res = await search({ limit: 100, includeInactive: true }).expect(201);
    expect(codes(res.body)).toEqual([
      'CANCEL',
      'NEGATIVE',
      'NEVER',
      'ORPHAN-ZERO',
      'STOCKED',
    ]);
  });

  it('sums variants signed: -1 and +1 cancel to 0, so the group is out of stock', async () => {
    const res = await search({
      limit: 100,
      includeInactive: true,
      outOfStock: true,
    }).expect(201);
    // The whole point: CANCEL holds a +1 variant yet still counts as exhausted.
    expect(codes(res.body)).toContain('CANCEL');
    // And a genuinely stocked group is excluded, so the filter is not a no-op.
    expect(codes(res.body)).not.toContain('STOCKED');
  });

  it('treats a group with no stock_balances row as 0, not as missing', async () => {
    const res = await search({
      limit: 100,
      includeInactive: true,
      outOfStock: true,
    }).expect(201);
    expect(codes(res.body)).toContain('NEVER');
  });

  it('includes a group whose total is negative', async () => {
    const res = await search({
      limit: 100,
      includeInactive: true,
      outOfStock: true,
    }).expect(201);
    expect(codes(res.body)).toContain('NEGATIVE');
  });

  it('includes ungrouped (orphan) items, which come from the other CTE arm', async () => {
    const res = await search({
      limit: 100,
      includeInactive: true,
      outOfStock: true,
    }).expect(201);
    expect(codes(res.body)).toContain('ORPHAN-ZERO');
  });

  it('ANDs with the column filters instead of replacing them', async () => {
    const res = await search({
      limit: 100,
      includeInactive: true,
      outOfStock: true,
      code: { operator: '*', value: 'NEVER' },
    }).expect(201);
    expect(codes(res.body)).toEqual(['NEVER']);
  });

  it('keeps total consistent with the filtered set when paginating', async () => {
    const res = await search({
      limit: 2,
      page: 1,
      includeInactive: true,
      outOfStock: true,
    }).expect(201);
    expect(res.body.total).toBe(4);
    expect(res.body.data).toHaveLength(2);
  });

  // Last on purpose: switching branch mints a new token and revokes the current
  // session, so every test above would 401 if this ran earlier.
  it('scopes the sum to one branch — STOCKED is exhausted at B but not at A', async () => {
    const atA = await search({
      limit: 100,
      includeInactive: true,
      outOfStock: true,
    }).expect(201);
    expect(codes(atA.body)).not.toContain('STOCKED');
    expect(atA.body.total).toBe(4);

    // ActorContext resolves `jwt ?? header`, so the JWT's branch wins outright
    // and X-Branch-Id alone can never move the query to another branch —
    // switching has to mint a new token, exactly as BranchSelector does.
    const switched = await request(app.getHttpServer())
      .post('/auth/switch-branch')
      .set({ Authorization: authHeader(seed.accessToken) })
      .send({ branchId: BRANCH_B })
      .expect(200);

    const atB = await search(
      { limit: 100, includeInactive: true, outOfStock: true },
      switched.body.accessToken,
    ).expect(201);

    // Its only stock lives at A, so at B the whole catalogue is exhausted.
    expect(codes(atB.body)).toContain('STOCKED');
    expect(atB.body.total).toBe(5);
  });
});
