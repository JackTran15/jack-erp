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
  buyMGetNBody,
  giftItemBody,
  invoiceDiscountBody,
  itemDiscountBody,
  seedPromotionFixtures,
  tieredDiscountBody,
  type PromotionSeedResult,
} from './setup/promotion-seed';

/**
 * AC-01…AC-09 plus BR-001/BR-002 over real HTTP.
 *
 * The arithmetic is already pinned down by the domain unit tests; running it
 * again here is deliberate but narrow — it proves the engine, the repository,
 * the catalogue reader and the HTTP layer agree on real rows. That is where a
 * `numeric` column read back as a string, or a category path never loaded,
 * would show up and unit tests never would.
 */
describe('Promotion evaluate (e2e)', () => {
  let app: INestApplication;
  let base: SeedResult;
  let fixtures: PromotionSeedResult;

  const itemId = (code: string) => fixtures.items.find((i) => i.code === code)!.id;

  const createProgram = (body: unknown) =>
    request(app.getHttpServer())
      .post('/v2/promotions')
      .set('Authorization', authHeader(base.accessToken))
      .send(body as object)
      .expect(201);

  /** `evaluate` is branch-scoped — without `X-Branch-Id` the guard answers 403. */
  const evaluate = (body: unknown) =>
    request(app.getHttpServer())
      .post('/v2/promotions/evaluate')
      .set('Authorization', authHeader(base.accessToken))
      .set('X-Branch-Id', base.branchId)
      .send(body as object);

  const line = (code: string, quantity: number, unitPrice: number, lineId = code) => ({
    lineId,
    itemId: itemId(code),
    quantity,
    unitPrice,
  });

  /**
   * Builds `at` from *server-local* components.
   *
   * `checkGenericEligibility` reads the day and the hour with `Date#getDay()` /
   * `Date#getHours()`, which resolve in the process timezone — so a hard-coded
   * `…T01:00:00Z` means 01:00 only on a UTC box and 08:00 in Vietnam. Pinning the
   * local components keeps these cases about the window logic instead of about
   * where the test happens to run. See A-32 for the underlying defect.
   */
  const atLocal = (y: number, m: number, d: number, h: number, min = 0) =>
    new Date(y, m - 1, d, h, min, 0).toISOString();

  /** Each case owns its programs; wiping between them keeps BR-001 deterministic. */
  const clearPrograms = async () => {
    const ds = app.get(DataSource);
    await ds.query('DELETE FROM promotion_lines');
    await ds.query('DELETE FROM promotion_tiers');
    await ds.query('DELETE FROM promotion_conditions');
    await ds.query('DELETE FROM promotion_branches');
    await ds.query('DELETE FROM promotion_customer_groups');
    await ds.query('DELETE FROM promotion_groups');
    await ds.query('DELETE FROM promotion_programs');
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    base = await seedBaseData(app);
    fixtures = await seedPromotionFixtures(app, base);
    // Booting AppModule wires every Kafka consumer; measured at ~130s locally.
  }, 300_000);

  // Closing the app disconnects every Kafka consumer one by one; the default
  // 30s hook timeout expires mid-teardown and Jest reports it as a suite failure
  // even when all tests passed.
  afterAll(async () => {
    await app?.close();
  }, 120_000);

  beforeEach(clearPrograms);

  it('AC-01: 30% off a 685.000 SKU discounts 205.500 and leaves 479.500', async () => {
    await createProgram(itemDiscountBody(itemId('SKU-685')));

    const res = await evaluate({ lines: [line('SKU-685', 1, 685_000)] }).expect(201);

    expect(res.body.appliedPrograms).toHaveLength(1);
    const applied = res.body.appliedPrograms[0];
    expect(applied.discountAmount).toBe(205_500);
    expect(applied.lineDiscounts[0]).toMatchObject({
      lineId: 'SKU-685',
      discountAmount: 205_500,
      unitPriceAfter: 479_500,
    });
    expect(res.body.promotionDiscount).toBe(205_500);
    expect(res.body.amountAfterPromotion).toBe(479_500);
  });

  it('AC-03: a STOPPED program does not apply, and is not offered as a near-miss', async () => {
    const created = await createProgram(itemDiscountBody(itemId('SKU-685')));
    await request(app.getHttpServer())
      .patch(`/v2/promotions/${created.body.id}/status`)
      .set('Authorization', authHeader(base.accessToken))
      .send({ status: 'STOPPED' })
      .expect(200);

    const res = await evaluate({ lines: [line('SKU-685', 1, 685_000)] }).expect(201);

    expect(res.body.promotionDiscount).toBe(0);
    expect(res.body.appliedPrograms).toHaveLength(0);

    // `findActive` filters `status = TRACKING` in SQL, so a stopped program is
    // never a candidate and never reaches the engine's own STOPPED check. That is
    // deliberate: `skippedPrograms` is the cashier's near-miss list ("needs 50k
    // more for the gift"), and a promotion the owner switched off is not a near
    // miss. The domain check stays as defence in depth for callers that hand the
    // resolver programs from elsewhere. See A-33.
    expect(res.body.skippedPrograms).toHaveLength(0);
  });

  it('AC-04: a weekdays-only program is skipped on a Sunday with reason DAY_OF_WEEK', async () => {
    const created = await createProgram(
      itemDiscountBody(itemId('SKU-685'), { daysOfWeek: [1, 2, 3, 4, 5] }),
    );

    // 2026-08-02 is a Sunday.
    const res = await evaluate({
      at: atLocal(2026, 8, 2, 10),
      lines: [line('SKU-685', 1, 685_000)],
    }).expect(201);

    expect(res.body.skippedPrograms).toContainEqual(
      expect.objectContaining({ programId: created.body.id, reason: 'DAY_OF_WEEK' }),
    );
  });

  it('AC-05: outside the time window it is skipped; an overnight shift still applies', async () => {
    const daytime = await createProgram(
      itemDiscountBody(itemId('SKU-685'), {
        name: 'Evening only',
        startTime: '18:00',
        endTime: '21:00',
      }),
    );

    const tooEarly = await evaluate({
      at: atLocal(2026, 8, 3, 15),
      lines: [line('SKU-685', 1, 685_000)],
    }).expect(201);
    expect(tooEarly.body.skippedPrograms).toContainEqual(
      expect.objectContaining({ programId: daytime.body.id, reason: 'TIME_OF_DAY' }),
    );

    await clearPrograms();

    // 22:00–02:00 spans midnight: the window is an OR, not an AND.
    const overnight = await createProgram(
      itemDiscountBody(itemId('SKU-685'), {
        name: 'Overnight',
        startTime: '22:00',
        endTime: '02:00',
      }),
    );

    const atOne = await evaluate({
      at: atLocal(2026, 8, 3, 1),
      lines: [line('SKU-685', 1, 685_000)],
    }).expect(201);
    expect(atOne.body.appliedPrograms).toContainEqual(
      expect.objectContaining({ programId: overnight.body.id }),
    );
  });

  it('AC-06: tiers 5→10% and 10→20%; buying 7 lands on the 10% tier', async () => {
    await createProgram(tieredDiscountBody(itemId('SKU-100')));

    const res = await evaluate({ lines: [line('SKU-100', 7, 100_000)] }).expect(201);

    // 7 × 100.000 = 700.000, at 10% → 70.000.
    expect(res.body.promotionDiscount).toBe(70_000);
  });

  it('AC-07: multiplyGift over a 200.000 threshold gives 3 gifts on a 650.000 basket', async () => {
    await createProgram(giftItemBody(itemId('SKU-100')));

    const res = await evaluate({
      lines: [line('SKU-300', 1, 300_000, 'l1'), line('SKU-200', 1, 200_000, 'l2'), line('SKU-100', 1, 150_000, 'l3')],
    }).expect(201);

    expect(res.body.appliedPrograms).toHaveLength(1);
    const gifts = res.body.appliedPrograms[0].gifts;
    expect(gifts).toHaveLength(1);
    // floor(650.000 / 200.000) = 3
    expect(gifts[0].quantity).toBe(3);
  });

  it('AC-08: groupMatchMode ALL over two categories fails when only one is in the cart', async () => {
    const created = await createProgram(
      invoiceDiscountBody({
        name: 'Two categories, ALL',
        groups: [
          {
            ordinal: 0,
            lines: [
              { role: 'CONDITION', targetType: 'CATEGORY', targetId: fixtures.childCategoryId, sortOrder: 0 },
              { role: 'CONDITION', targetType: 'CATEGORY', targetId: fixtures.otherCategoryId, sortOrder: 1 },
            ],
          },
        ],
        condition: {
          type: 'MIN_INVOICE_AMOUNT',
          minAmount: 1,
          calcBasis: 'ITEM_CATEGORIES',
          groupMatchMode: 'ALL',
        },
      }),
    );

    // Only the child category is represented.
    const res = await evaluate({ lines: [line('SKU-100', 1, 100_000)] }).expect(201);

    expect(res.body.skippedPrograms).toContainEqual(
      expect.objectContaining({ programId: created.body.id, reason: 'CONDITION_NOT_MET' }),
    );
  });

  it('AC-09: buy 3 get the cheapest free discounts exactly the 100.000 unit', async () => {
    await createProgram(
      buyMGetNBody([itemId('SKU-100'), itemId('SKU-200'), itemId('SKU-300')]),
    );

    const res = await evaluate({
      lines: [
        line('SKU-100', 1, 100_000, 'l1'),
        line('SKU-200', 1, 200_000, 'l2'),
        line('SKU-300', 1, 300_000, 'l3'),
      ],
    }).expect(201);

    expect(res.body.promotionDiscount).toBe(100_000);
  });

  it('AC-12/BR-001: the lower `priority` wins the line; the loser reports RESOURCE_TAKEN', async () => {
    const winner = await createProgram(
      itemDiscountBody(itemId('SKU-685'), { name: '30% prio 10', priority: 10 }),
    );
    const loser = await createProgram({
      ...itemDiscountBody(itemId('SKU-685'), { name: '50% prio 20', priority: 20 }),
      groups: [
        {
          ordinal: 0,
          lines: [
            {
              role: 'REWARD',
              targetType: 'ITEM',
              targetId: itemId('SKU-685'),
              discountMode: 'PERCENT',
              discountValue: 50,
              sortOrder: 0,
            },
          ],
        },
      ],
    });

    const res = await evaluate({ lines: [line('SKU-685', 1, 685_000)] }).expect(201);

    expect(res.body.appliedPrograms).toHaveLength(1);
    expect(res.body.appliedPrograms[0].programId).toBe(winner.body.id);
    expect(res.body.promotionDiscount).toBe(205_500);
    expect(res.body.skippedPrograms).toContainEqual(
      expect.objectContaining({
        programId: loser.body.id,
        reason: 'RESOURCE_TAKEN',
        takenBy: winner.body.id,
      }),
    );
  });

  it('AC-13/BR-002: NON_PROMO_ONLY only discounts the lines the item promo did not claim', async () => {
    await createProgram(itemDiscountBody(itemId('SKU-685'), { priority: 10 }));
    await createProgram(
      invoiceDiscountBody({
        name: 'Invoice 10% non-promo only',
        priority: 20,
        invoiceScope: 'NON_PROMO_ONLY',
        discountValue: 10,
      }),
    );

    const res = await evaluate({
      lines: [line('SKU-685', 1, 685_000, 'claimed'), line('SKU-200', 1, 200_000, 'free')],
    }).expect(201);

    const invoiceLevel = res.body.appliedPrograms.find(
      (p: any) => p.type === 'INVOICE_DISCOUNT',
    );
    // 10% of the untouched 200.000 line only — the 685.000 line is already taken.
    expect(invoiceLevel.discountAmount).toBe(20_000);
  });

  it('AC-14: an autoApply=false program waits until it is named in selectedProgramIds', async () => {
    const manual = await createProgram(
      itemDiscountBody(itemId('SKU-685'), { name: 'Manual', autoApply: false }),
    );

    const untouched = await evaluate({ lines: [line('SKU-685', 1, 685_000)] }).expect(201);
    expect(untouched.body.appliedPrograms).toHaveLength(0);
    expect(untouched.body.availablePrograms).toContainEqual(
      expect.objectContaining({ programId: manual.body.id, autoApply: false }),
    );
    expect(untouched.body.skippedPrograms).toContainEqual(
      expect.objectContaining({ programId: manual.body.id, reason: 'NOT_SELECTED' }),
    );

    const selected = await evaluate({
      lines: [line('SKU-685', 1, 685_000)],
      selectedProgramIds: [manual.body.id],
    }).expect(201);
    expect(selected.body.appliedPrograms).toContainEqual(
      expect.objectContaining({ programId: manual.body.id }),
    );
  });

  it('AC-25: a promotion on the parent category reaches an item in the child category', async () => {
    await createProgram(
      invoiceDiscountBody({
        name: 'Parent category only',
        groups: [
          {
            ordinal: 0,
            lines: [
              { role: 'CONDITION', targetType: 'CATEGORY', targetId: fixtures.parentCategoryId, sortOrder: 0 },
            ],
          },
        ],
        condition: {
          type: 'MIN_INVOICE_AMOUNT',
          minAmount: 1,
          calcBasis: 'ITEM_CATEGORIES',
          groupMatchMode: 'ANY',
        },
      }),
    );

    // SKU-100 sits in the child category, never named by the promotion.
    const res = await evaluate({ lines: [line('SKU-100', 1, 100_000)] }).expect(201);

    expect(res.body.appliedPrograms).toHaveLength(1);
  });

  it('AC-26: a bad cart is a client error, not a silently wrong total', async () => {
    const unknownItem = await evaluate({
      lines: [{ lineId: 'x', itemId: '99999999-0000-4000-8000-000000000000', quantity: 1, unitPrice: 1000 }],
    }).expect(400);
    expect(JSON.stringify(unknownItem.body)).toContain('UNKNOWN_ITEM');

    const unknownCustomer = await evaluate({
      customerId: '99999999-0000-4000-8000-000000000001',
      lines: [line('SKU-100', 1, 100_000)],
    }).expect(400);
    expect(JSON.stringify(unknownCustomer.body)).toContain('UNKNOWN_CUSTOMER');

    await evaluate({ lines: [] }).expect(400);
  });

  it('AC-22: evaluating repeatedly writes nothing', async () => {
    await createProgram(itemDiscountBody(itemId('SKU-685')));
    const ds = app.get(DataSource);

    const countAll = async () => {
      const tables = [
        'promotion_programs',
        'promotion_groups',
        'promotion_lines',
        'promotion_tiers',
        'promotion_conditions',
        'invoices',
      ];
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const [row] = await ds.query(`SELECT count(*)::int AS n FROM ${table}`);
        counts[table] = row.n;
      }
      return counts;
    };

    const before = await countAll();
    for (let i = 0; i < 10; i += 1) {
      await evaluate({ lines: [line('SKU-685', 1, 685_000)] }).expect(201);
    }
    expect(await countAll()).toEqual(before);
  });

  it('AC-29: the totals add up on every response', async () => {
    await createProgram(itemDiscountBody(itemId('SKU-685'), { priority: 10 }));
    await createProgram(
      invoiceDiscountBody({ name: 'Invoice 5%', priority: 20, discountValue: 5 }),
    );

    const res = await evaluate({
      lines: [line('SKU-685', 2, 685_000, 'a'), line('SKU-300', 1, 300_000, 'b')],
    }).expect(201);

    const sumApplied = res.body.appliedPrograms.reduce(
      (sum: number, p: any) => sum + p.discountAmount,
      0,
    );
    expect(sumApplied).toBe(res.body.promotionDiscount);
    expect(res.body.subtotal - res.body.promotionDiscount).toBe(res.body.amountAfterPromotion);

    for (const applied of res.body.appliedPrograms) {
      const sumLines = applied.lineDiscounts.reduce(
        (sum: number, l: any) => sum + l.discountAmount,
        0,
      );
      expect(sumLines).toBe(applied.discountAmount);
    }
  });

  it('requires a branch: evaluate without X-Branch-Id is a 403', async () => {
    await request(app.getHttpServer())
      .post('/v2/promotions/evaluate')
      .set('Authorization', authHeader(base.accessToken))
      .send({ lines: [line('SKU-100', 1, 100_000)] })
      .expect(403);
  });
});
