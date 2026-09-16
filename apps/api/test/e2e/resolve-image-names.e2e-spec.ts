import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  request,
  SeedResult,
} from './setup/test-app';
import { createUserWithPermissions } from './setup/checkout-saga-fixture';

/**
 * T-02-01 — POST /v2/inventory-items/resolve-image-names against a real
 * database: the `SKU (NN)` rule (AC-12), DUPLICATE_SEQ within one call
 * (AC-16), the product → orphan → variant priority with the parent product
 * as the variant's owner (A-03, A-09), inactive codes still matching (A-13),
 * organization isolation, the 500-name limit (A-14) and `inventory.read`.
 */
describe('Resolve image names v2 (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  const PRODUCT_A = 'aa000000-0000-4000-8000-00000000001a';
  const VARIANT_A_39 = 'ab000000-0000-4000-8000-00000000013a';
  const VARIANT_A_40 = 'ab000000-0000-4000-8000-00000000014a';
  const ITEM_B = 'ab000000-0000-4000-8000-00000000001b';
  const ITEM_D_INACTIVE = 'ab000000-0000-4000-8000-00000000001d';
  const PRODUCT_F = 'aa000000-0000-4000-8000-00000000001f';
  const VARIANT_F = 'ab000000-0000-4000-8000-00000000001f';
  const VARIANT_A_COLLIDES_F = 'ab000000-0000-4000-8000-0000000001af';
  const PRODUCT_G_INACTIVE = 'aa000000-0000-4000-8000-000000000a1c';
  const VARIANT_G = 'ab000000-0000-4000-8000-000000000a1c';

  const OTHER_ORG = 'e0000000-0000-4000-8000-000000000098';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    const org = seed.organizationId;
    const by = seed.userId;

    const product = (id: string, code: string, name: string, isActive = true) =>
      ds.query(
        `INSERT INTO products (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, NOW(), NOW())`,
        [id, org, code, name, isActive, by],
      );
    const item = (
      id: string,
      productId: string | null,
      code: string,
      name: string,
      isActive = true,
      organizationId = org,
    ) =>
      ds.query(
        `INSERT INTO items (id, organization_id, product_id, code, name, unit,
           purchase_price, selling_price, is_active, is_pos_visible, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'pcs', 1000, 2000, $6, true, $7::uuid, NOW(), NOW())`,
        [id, organizationId, productId, code, name, isActive, by],
      );

    // A: product with two variants.
    await product(PRODUCT_A, 'AAA-RIN-A', 'Giay A');
    await item(VARIANT_A_39, PRODUCT_A, 'AAA-RIN-A-DEN-39', 'Giay A Den 39');
    await item(VARIANT_A_40, PRODUCT_A, 'AAA-RIN-A-DEN-40', 'Giay A Den 40');
    // B: orphan item.
    await item(ITEM_B, null, 'AAA-RIN-B', 'Tui qua B');
    // D: inactive orphan — still matches (A-13).
    await item(ITEM_D_INACTIVE, null, 'AAA-RIN-D', 'Ngung kinh doanh D', false);
    // F: product whose code is also a variant code under A (A-09: product wins).
    await product(PRODUCT_F, 'AAA-RIN-F', 'Mu F');
    await item(VARIANT_F, PRODUCT_F, 'AAA-RIN-F-M', 'Mu F size M');
    await item(VARIANT_A_COLLIDES_F, PRODUCT_A, 'aaa-rin-f', 'Giay A trung ma F');
    // G: inactive product with an active variant — both still match (A-13).
    await product(PRODUCT_G_INACTIVE, 'AAA-RIN-G', 'Ngung kinh doanh G', false);
    await item(VARIANT_G, PRODUCT_G_INACTIVE, 'AAA-RIN-G-L', 'G size L');

    // Cross-tenant codes — never resolved for the seeded organization.
    await ds.query(
      `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'AAA-RIN-OTHER-P', 'Other Org Product', $2::uuid, NOW(), NOW())`,
      [OTHER_ORG, by],
    );
    await item(
      'ab000000-0000-4000-8000-00000000009e',
      null,
      'AAA-RIN-OTHER-I',
      'Other Org Item',
      true,
      OTHER_ORG,
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  function headers(): Record<string, string> {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  function resolve(
    body: Record<string, unknown>,
    hdrs: Record<string, string> = headers(),
  ) {
    return request(app.getHttpServer())
      .post('/v2/inventory-items/resolve-image-names')
      .set(hdrs)
      .send(body);
  }

  const NONE = { match: null, ownerId: null, ownerCode: null, ownerName: null };

  it('AC-12: applies the SKU (NN) rule row by row, in input order, against a real product code', async () => {
    const names = [
      'AAA-RIN-A (01)',
      'AAA-RIN-A(2)',
      'aaa-rin-a (10)',
      'AAA-RIN-A (11)',
      'AAA-RIN-A (00)',
      'AAA-RIN-A (01)',
      'XYZ',
    ];
    const res = await resolve({ names }).expect(200);

    expect(res.body.data.map((r: { name: string }) => r.name)).toEqual(names);
    const A = { match: 'product', ownerId: PRODUCT_A, ownerCode: 'AAA-RIN-A', ownerName: 'Giay A' };
    expect(res.body.data).toEqual([
      { name: 'AAA-RIN-A (01)', code: 'AAA-RIN-A', seq: 1, ...A, error: null },
      { name: 'AAA-RIN-A(2)', code: 'AAA-RIN-A', seq: 2, ...A, error: null },
      { name: 'aaa-rin-a (10)', code: 'aaa-rin-a', seq: 10, ...A, error: null },
      { name: 'AAA-RIN-A (11)', code: 'AAA-RIN-A', seq: 11, ...A, error: 'SEQ_OUT_OF_RANGE' },
      { name: 'AAA-RIN-A (00)', code: 'AAA-RIN-A', seq: 0, ...A, error: 'SEQ_OUT_OF_RANGE' },
      { name: 'AAA-RIN-A (01)', code: 'AAA-RIN-A', seq: 1, ...A, error: 'DUPLICATE_SEQ' },
      { name: 'XYZ', code: 'XYZ', seq: null, ...NONE, error: null },
    ]);
  });

  it('AC-12: strips the image extension case-insensitively before parsing', async () => {
    const res = await resolve({
      names: ['AAA-RIN-A (03).png', 'AAA-RIN-A (04).JPEG', 'AAA-RIN-B.webp', 'AAA-RIN-B (05).gif'],
    }).expect(200);
    expect(res.body.data.map((r: { code: string; seq: number | null; match: string }) => [r.code, r.seq, r.match])).toEqual([
      ['AAA-RIN-A', 3, 'product'],
      ['AAA-RIN-A', 4, 'product'],
      ['AAA-RIN-B', null, 'orphan'],
      ['AAA-RIN-B', 5, 'orphan'],
    ]);
  });

  it('AC-16: the second name with the same owner and sequence is DUPLICATE_SEQ, and keeps its owner', async () => {
    const res = await resolve({
      names: ['AAA-RIN-A (01).png', 'AAA-RIN-A (01).jpg', 'AAA-RIN-B (01).png'],
    }).expect(200);
    expect(res.body.data.map((r: { error: string | null }) => r.error)).toEqual([
      null,
      'DUPLICATE_SEQ',
      null,
    ]);
    expect(res.body.data[1]).toMatchObject({
      match: 'product',
      ownerId: PRODUCT_A,
      ownerCode: 'AAA-RIN-A',
      seq: 1,
    });
  });

  it('matches an orphan item with the item itself as owner', async () => {
    const res = await resolve({ names: ['aaa-rin-b (02).jpg'] }).expect(200);
    expect(res.body.data[0]).toEqual({
      name: 'aaa-rin-b (02).jpg',
      code: 'aaa-rin-b',
      seq: 2,
      match: 'orphan',
      ownerId: ITEM_B,
      ownerCode: 'AAA-RIN-B',
      ownerName: 'Tui qua B',
      error: null,
    });
  });

  it('A-03: a variant code resolves to the parent product; the typed code is kept', async () => {
    const res = await resolve({
      names: ['aaa-rin-a-den-39.png', 'AAA-RIN-A-DEN-40 (02)'],
    }).expect(200);
    expect(res.body.data[0]).toEqual({
      name: 'aaa-rin-a-den-39.png',
      code: 'aaa-rin-a-den-39',
      seq: null,
      match: 'variant',
      ownerId: PRODUCT_A,
      ownerCode: 'AAA-RIN-A',
      ownerName: 'Giay A',
      error: null,
    });
    expect(res.body.data[1]).toMatchObject({
      code: 'AAA-RIN-A-DEN-40',
      seq: 2,
      match: 'variant',
      ownerId: PRODUCT_A,
      ownerCode: 'AAA-RIN-A',
    });
  });

  it('A-03 + AC-16: a variant name shares the parent product sequence space', async () => {
    const res = await resolve({
      names: ['AAA-RIN-A (02)', 'AAA-RIN-A-DEN-39 (02)'],
    }).expect(200);
    expect(res.body.data[1]).toMatchObject({
      match: 'variant',
      ownerId: PRODUCT_A,
      error: 'DUPLICATE_SEQ',
    });
  });

  it('A-09: a code that is both a product and a variant resolves to the product', async () => {
    const res = await resolve({ names: ['AAA-RIN-F (01)', 'aaa-rin-f'] }).expect(200);
    for (const row of res.body.data) {
      expect(row).toMatchObject({
        match: 'product',
        ownerId: PRODUCT_F,
        ownerCode: 'AAA-RIN-F',
        ownerName: 'Mu F',
      });
    }
  });

  it('A-13: inactive product and item codes still match', async () => {
    const res = await resolve({
      names: ['AAA-RIN-D (01)', 'AAA-RIN-G (01)', 'AAA-RIN-G-L'],
    }).expect(200);
    expect(res.body.data[0]).toMatchObject({ match: 'orphan', ownerId: ITEM_D_INACTIVE, ownerCode: 'AAA-RIN-D' });
    expect(res.body.data[1]).toMatchObject({ match: 'product', ownerId: PRODUCT_G_INACTIVE, ownerCode: 'AAA-RIN-G' });
    expect(res.body.data[2]).toMatchObject({ match: 'variant', ownerId: PRODUCT_G_INACTIVE, ownerCode: 'AAA-RIN-G' });
  });

  it('never resolves codes of another organization', async () => {
    const res = await resolve({
      names: ['AAA-RIN-OTHER-P (01)', 'AAA-RIN-OTHER-I'],
    }).expect(200);
    expect(res.body.data).toEqual([
      { name: 'AAA-RIN-OTHER-P (01)', code: 'AAA-RIN-OTHER-P', seq: 1, ...NONE, error: null },
      { name: 'AAA-RIN-OTHER-I', code: 'AAA-RIN-OTHER-I', seq: null, ...NONE, error: null },
    ]);
  });

  it('returns an empty code for a name that is only a sequence', async () => {
    const res = await resolve({ names: ['(01).png'] }).expect(200);
    expect(res.body.data[0]).toEqual({
      name: '(01).png',
      code: '',
      seq: 1,
      ...NONE,
      error: null,
    });
  });

  it('A-14: accepts 500 names and rejects 501', async () => {
    const names = Array.from({ length: 500 }, (_, i) => `AAA-RIN-A (${(i % 10) + 1}).png`);
    const ok = await resolve({ names }).expect(200);
    expect(ok.body.data).toHaveLength(500);
    expect(ok.body.data[0].error).toBeNull();
    expect(ok.body.data[10].error).toBe('DUPLICATE_SEQ');

    await resolve({ names: [...names, 'one more'] }).expect(400);
  });

  it('rejects an empty list, non-string names, over-long names and unknown fields (400)', async () => {
    await resolve({ names: [] }).expect(400);
    await resolve({ names: [1] }).expect(400);
    await resolve({ names: ['x'.repeat(256)] }).expect(400);
    await resolve({ names: ['AAA-RIN-A'], ownerType: 'PRODUCT' }).expect(400);
    await resolve({}).expect(400);
  });

  it('an account with only inventory.read gets 200; without it 403', async () => {
    const reader = await createUserWithPermissions(app, seed, ['inventory.read']);
    const res = await resolve({ names: ['AAA-RIN-A (01)'] }, reader.headers()).expect(200);
    expect(res.body.data[0].match).toBe('product');

    const noRead = await createUserWithPermissions(app, seed, ['inventory.write']);
    await resolve({ names: ['AAA-RIN-A (01)'] }, noRead.headers()).expect(403);
  });
});
