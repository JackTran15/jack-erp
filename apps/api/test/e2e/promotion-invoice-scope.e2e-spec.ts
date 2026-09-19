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
  invoiceDiscountBody,
  itemDiscountBody,
  seedPromotionFixtures,
  type PromotionSeedResult,
} from './setup/promotion-seed';

/**
 * UOW-02 (2026091803-ctkm-item-discount-invoice-scope) — BR-002:
 * "Dòng trước, hóa đơn sau trên phần còn lại (NON_PROMO_ONLY)".
 *
 * The engine always implemented this; what was broken was the write path, which
 * hardcoded ALL_ITEMS (promotion-scope-points-toggle ADR-01, 2026-08-17, now
 * superseded). So these cases pin the *arithmetic* end to end over real HTTP and
 * a real database, including the legacy direction: an ALL_ITEMS programme saved
 * before the reversal must keep billing the whole cart (A-03).
 *
 * The cart is 685,000 + 100,000 = 785,000 throughout, so every expected number
 * below can be checked by hand.
 */
describe('Promotion — invoice-discount scope / BR-002 (e2e)', () => {
  let app: INestApplication;
  let base: SeedResult;
  let fixtures: PromotionSeedResult;
  let ds: DataSource;

  const headers = () => ({
    Authorization: authHeader(base.accessToken),
    'X-Branch-Id': base.branchId,
  });

  const post = (url: string, body: unknown) =>
    request(app.getHttpServer()).post(url).set(headers()).send(body as object);

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    base = await seedBaseData(app);
    fixtures = await seedPromotionFixtures(app, base);
    ds = app.get(DataSource);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
  }, 120_000);

  // BR-001 is first-match-wins per line, so programmes left behind by one case
  // would silently steal the line from the next.
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

  /** ITEM_DISCOUNT at a chosen percentage — the fixture's own default is 30%. */
  const itemDiscountAt = (code: string, percent: number, name: string) =>
    itemDiscountBody(itemId(code), {
      name,
      groups: [
        {
          ordinal: 0,
          lines: [
            {
              role: 'REWARD',
              targetType: 'ITEM',
              targetId: itemId(code),
              discountMode: 'PERCENT',
              discountValue: percent,
              sortOrder: 0,
            },
          ],
        },
      ],
    });

  /** Reads the stored scope back, so a case can never pass down the wrong branch. */
  const storedScope = async (id: string) => {
    const [row] = await ds.query<{ invoice_scope: string | null }[]>(
      `SELECT invoice_scope FROM promotion_programs WHERE id = $1::uuid`,
      [id],
    );
    return row.invoice_scope;
  };

  const twoLineCart = () => ({
    lines: [
      { lineId: 'L685', itemId: itemId('SKU-685'), quantity: 1, unitPrice: 685_000 },
      { lineId: 'L100', itemId: itemId('SKU-100'), quantity: 1, unitPrice: 100_000 },
    ],
  });

  it('AC-10: the invoice discount bills only the line the item discount did not take', async () => {
    const a = await post('/v2/promotions', itemDiscountAt('SKU-685', 10, 'CTKM-A hàng hóa 10%')).expect(201);
    const b = await post(
      '/v2/promotions',
      invoiceDiscountBody({ name: 'CTKM-B hóa đơn 10%', invoiceScope: 'NON_PROMO_ONLY', priority: 200 }),
    ).expect(201);

    expect(await storedScope(b.body.id)).toBe('NON_PROMO_ONLY');

    const res = await post('/v2/promotions/evaluate', twoLineCart()).expect(201);

    const applied = (id: string) =>
      res.body.appliedPrograms.find((p: { programId: string }) => p.programId === id);

    expect(res.body.subtotal).toBe(785_000);
    // Item discount: 10% of 685,000.
    expect(applied(a.body.id).discountAmount).toBe(68_500);
    // Invoice discount: 10% of the untouched 100,000 — NOT 10% of 785,000 (78,500).
    expect(applied(b.body.id).discountAmount).toBe(10_000);
    expect(applied(b.body.id).lineDiscounts.map((l: { lineId: string }) => l.lineId)).toEqual(['L100']);
    expect(res.body.promotionDiscount).toBe(78_500);
    expect(res.body.amountAfterPromotion).toBe(706_500);
  });

  it('AC-11: when the item discount takes every line, the invoice discount does not apply at all', async () => {
    await post('/v2/promotions', itemDiscountAt('SKU-685', 10, 'CTKM-A 685')).expect(201);
    await post('/v2/promotions', itemDiscountAt('SKU-100', 10, 'CTKM-A 100')).expect(201);
    const b = await post(
      '/v2/promotions',
      invoiceDiscountBody({ name: 'CTKM-B hóa đơn 10%', invoiceScope: 'NON_PROMO_ONLY', priority: 200 }),
    ).expect(201);

    const res = await post('/v2/promotions/evaluate', twoLineCart()).expect(201);

    expect(
      res.body.appliedPrograms.find((p: { programId: string }) => p.programId === b.body.id),
    ).toBeUndefined();
    const skipped = res.body.skippedPrograms.find((p: { programId: string }) => p.programId === b.body.id);
    expect(skipped).toBeDefined();
    expect(skipped.reason).toBe('CONDITION_NOT_MET');
    // 10% of each line, and nothing on top.
    expect(res.body.promotionDiscount).toBe(78_500);
  });

  it('AC-12: with no item discount in play, the invoice discount bills the whole cart', async () => {
    const b = await post(
      '/v2/promotions',
      invoiceDiscountBody({ name: 'CTKM-B hóa đơn 10%', invoiceScope: 'NON_PROMO_ONLY' }),
    ).expect(201);

    const res = await post('/v2/promotions/evaluate', twoLineCart()).expect(201);

    const applied = res.body.appliedPrograms.find((p: { programId: string }) => p.programId === b.body.id);
    expect(applied.discountAmount).toBe(78_500);
    expect(res.body.amountAfterPromotion).toBe(706_500);
  });

  it('AC-16: a legacy ALL_ITEMS programme keeps billing the whole cart (A-03)', async () => {
    const a = await post('/v2/promotions', itemDiscountAt('SKU-685', 10, 'CTKM-A hàng hóa 10%')).expect(201);
    const legacy = await post(
      '/v2/promotions',
      invoiceDiscountBody({ name: 'CTKM cũ ALL_ITEMS', invoiceScope: 'ALL_ITEMS', priority: 200 }),
    ).expect(201);

    expect(await storedScope(legacy.body.id)).toBe('ALL_ITEMS');

    const res = await post('/v2/promotions/evaluate', twoLineCart()).expect(201);

    const applied = (id: string) =>
      res.body.appliedPrograms.find((p: { programId: string }) => p.programId === id);

    expect(applied(a.body.id).discountAmount).toBe(68_500);
    // Still the full 785,000 base — this is the stacking the new default avoids,
    // deliberately left intact for programmes saved before the reversal.
    expect(applied(legacy.body.id).discountAmount).toBe(78_500);
    expect(res.body.promotionDiscount).toBe(147_000);
    expect(res.body.amountAfterPromotion).toBe(638_000);
  });
});
