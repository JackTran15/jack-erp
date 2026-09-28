import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  authHeader,
  createTestApp,
  request,
  resetDatabase,
  seedBaseData,
  type SeedResult,
} from './setup/test-app';
import {
  itemDiscountBody,
  seedPromotionFixtures,
  type PromotionSeedResult,
} from './setup/promotion-seed';

/**
 * UOW-01 (2026092701-promotion-item-discount-import-export) — the backoffice
 * grid's lookup cell stored an inventory-item id but the mapper tagged it
 * `PRODUCT` (A-05). `promotion-item-discount.e2e-spec.ts` always sends
 * `targetType: 'ITEM'` directly, so nothing pinned what the engine does with
 * that mislabelled shape, nor that ITEM and PRODUCT rows survive a round-trip.
 *
 * AC-04 pins engine semantics: an item id under `PRODUCT` never matches.
 * AC-03 pins persistence: a GET → PUT cycle leaves `target_type` untouched,
 * read back from `promotion_lines`, not from the response body.
 */
describe('Promotion — ITEM_DISCOUNT target type per row (e2e)', () => {
  let app: INestApplication;
  let base: SeedResult;
  let fixtures: PromotionSeedResult;
  let ds: DataSource;

  /** A real product (mẫu mã) that SKU-685 belongs to — see beforeAll. */
  const PRODUCT_ID = 'e3000000-0000-4000-8000-000000000001';

  const headers = () => ({
    Authorization: authHeader(base.accessToken),
    'X-Branch-Id': base.branchId,
  });

  const post = (url: string, body: unknown) =>
    request(app.getHttpServer()).post(url).set(headers()).send(body as object);

  const put = (url: string, body: unknown) =>
    request(app.getHttpServer()).put(url).set(headers()).send(body as object);

  const get = (url: string) => request(app.getHttpServer()).get(url).set(headers());

  // Booting AppModule wires every Kafka consumer (~130s on a local docker stack).
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    base = await seedBaseData(app);
    fixtures = await seedPromotionFixtures(app, base);
    ds = app.get(DataSource);

    // In real data every SKU belongs to a product. Linking SKU-685 to one makes
    // the AC-04 negative meaningful: the engine then compares the line's
    // targetId against a product id that genuinely differs from the item id,
    // instead of short-circuiting on a missing `productId`.
    await ds.query(
      `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'MM-685', 'Mẫu giày nữ 685', $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PRODUCT_ID, base.organizationId, base.userId],
    );
    await ds.query(`UPDATE items SET product_id = $1::uuid WHERE id = $2::uuid`, [
      PRODUCT_ID,
      itemId('SKU-685'),
    ]);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
  }, 120_000);

  // BR-001 is first-match-wins per line: every case targets SKU-685, so each
  // starts from an empty programme set.
  afterEach(async () => {
    await ds.query('DELETE FROM promotion_lines');
    await ds.query('DELETE FROM promotion_tiers');
    await ds.query('DELETE FROM promotion_conditions');
    await ds.query('DELETE FROM promotion_groups');
    await ds.query('DELETE FROM promotion_branches');
    await ds.query('DELETE FROM promotion_customer_groups');
    await ds.query('DELETE FROM promotion_programs');
  });

  const itemId = (code: string) => fixtures.items.find((i) => i.code === code)!.id;

  const rewardLine = (targetType: string, targetId: string, discountValue: number, sortOrder = 0) => ({
    role: 'REWARD',
    targetType,
    targetId,
    discountMode: 'PERCENT',
    discountValue,
    sortOrder,
  });

  const bodyWithLines = (name: string, lines: ReturnType<typeof rewardLine>[]) =>
    itemDiscountBody(itemId('SKU-685'), { name, groups: [{ ordinal: 0, lines }] });

  const evaluate685 = () =>
    post('/v2/promotions/evaluate', {
      lines: [{ lineId: 'l1', itemId: itemId('SKU-685'), quantity: 1, unitPrice: 685_000 }],
    }).expect(201);

  const storedTargetTypes = async (programId: string) =>
    ds.query<{ target_id: string; target_type: string }[]>(
      `SELECT target_id, target_type
         FROM promotion_lines
        WHERE program_id = $1::uuid AND role = 'REWARD'
        ORDER BY sort_order`,
      [programId],
    );

  // ---------------------------------------------------------------- AC-04
  describe('AC-04 — engine semantics of ITEM vs PRODUCT', () => {
    it('an item id stored under PRODUCT (the old mapper shape) gives no discount', async () => {
      const created = await post(
        '/v2/promotions',
        bodyWithLines('AC-04 PRODUCT mang item id', [rewardLine('PRODUCT', itemId('SKU-685'), 10)]),
      ).expect(201);

      const [row] = await storedTargetTypes(created.body.id);
      expect(row).toEqual({ target_id: itemId('SKU-685'), target_type: 'PRODUCT' });

      const res = await evaluate685();
      expect(res.body.promotionDiscount).toBe(0);
      expect(
        res.body.appliedPrograms.find((p: { programId: string }) => p.programId === created.body.id),
      ).toBeUndefined();
    });

    it('the same programme with the line tagged ITEM gives 68,500', async () => {
      const created = await post(
        '/v2/promotions',
        bodyWithLines('AC-04 ITEM', [rewardLine('ITEM', itemId('SKU-685'), 10)]),
      ).expect(201);

      const res = await evaluate685();
      expect(res.body.promotionDiscount).toBe(68_500);
      const applied = res.body.appliedPrograms.find(
        (p: { programId: string }) => p.programId === created.body.id,
      );
      expect(applied.discountAmount).toBe(68_500);
    });

    // Control: without it, "PRODUCT lines are simply ignored" would also pass
    // the first case. A PRODUCT line carrying the real product id does match.
    it('control: PRODUCT with the real product id of SKU-685 does match', async () => {
      await post(
        '/v2/promotions',
        bodyWithLines('AC-04 PRODUCT thật', [rewardLine('PRODUCT', PRODUCT_ID, 10)]),
      ).expect(201);

      const res = await evaluate685();
      expect(res.body.promotionDiscount).toBe(68_500);
    });
  });

  // ---------------------------------------------------------------- AC-03
  describe('AC-03 — ITEM and PRODUCT rows survive GET → PUT unchanged', () => {
    it('reopening and saving without edits leaves target_type as stored', async () => {
      const sent = bodyWithLines('AC-03 round-trip', [
        rewardLine('ITEM', itemId('SKU-685'), 10, 0),
        rewardLine('PRODUCT', PRODUCT_ID, 5, 1),
      ]);
      const created = await post('/v2/promotions', sent).expect(201);
      const id = created.body.id as string;

      const before = await storedTargetTypes(id);
      expect(before).toEqual([
        { target_id: itemId('SKU-685'), target_type: 'ITEM' },
        { target_id: PRODUCT_ID, target_type: 'PRODUCT' },
      ]);

      // Rebuild the write payload from what GET returns — what a reopened form
      // has to work with — and check it is the payload originally sent.
      const fetched = await get(`/v2/promotions/${id}`).expect(200);
      const lines = fetched.body.groups[0].lines
        .filter((l: { role: string }) => l.role === 'REWARD')
        .map((l: ReturnType<typeof rewardLine>) => ({
          role: l.role,
          targetType: l.targetType,
          targetId: l.targetId,
          discountMode: l.discountMode,
          discountValue: l.discountValue,
          sortOrder: l.sortOrder,
        }));
      const resent = bodyWithLines('AC-03 round-trip', lines);
      expect(resent).toEqual(sent);

      await put(`/v2/promotions/${id}`, resent).expect(200);

      const after = await storedTargetTypes(id);
      expect(after).toEqual(before);
    });
  });
});
