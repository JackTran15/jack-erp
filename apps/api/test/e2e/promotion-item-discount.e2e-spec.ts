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
 * UOW-01 (2026091803-ctkm-item-discount-invoice-scope) — "Giảm giá hàng hóa" was
 * unreachable from the UI between 2026-08-11 and 2026-09-18 because
 * `ADD_NEW_TYPE_OPTIONS` filtered it out of the "Thêm mới" menu. The engine, the
 * tables and the form variant were all still there, so the question this suite
 * answers is not "does the code exist" but "does the whole path still work after
 * five weeks with nobody walking it".
 *
 * Every case reads back from the tables rather than trusting the response body:
 * a mapper that quietly drops a field returns a cheerful 201 either way.
 *
 * Its own file rather than an addition to `promotion-crud.e2e-spec.ts`, which is
 * the epic's AC-16..23 parity suite and has a different remit.
 */
describe('Promotion — ITEM_DISCOUNT reopened (e2e)', () => {
  let app: INestApplication;
  let base: SeedResult;
  let fixtures: PromotionSeedResult;
  let ds: DataSource;

  /**
   * `X-Branch-Id` is not optional here: `/v2/promotions/evaluate` carries
   * `@RequireBranchScope()`, and omitting the header is a 403 that reads exactly
   * like a missing permission.
   */
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
  }, 300_000);

  // Teardown disconnects each Kafka consumer in turn; the default 30s hook
  // timeout expires mid-teardown and Jest reports it as a suite failure even
  // when every test passed.
  afterAll(async () => {
    await app?.close();
  }, 120_000);

  /**
   * Every case here builds a programme on the same SKU-685, and BR-001 is
   * first-match-wins per line: without this the second programme in the file
   * loses the line to the first and the assertion fails for a reason that has
   * nothing to do with what the test is checking.
   */
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

  /** The reward row is where ITEM_DISCOUNT keeps its mode/value — not the program row. */
  const rewardRow = async (programId: string) => {
    const [row] = await ds.query<{ target_id: string; discount_mode: string; discount_value: string }[]>(
      `SELECT target_id, discount_mode, discount_value
         FROM promotion_lines
        WHERE program_id = $1::uuid AND role = 'REWARD'`,
      [programId],
    );
    return row;
  };

  const evaluate = (lines: Array<{ lineId: string; itemId: string; quantity: number; unitPrice: number }>) =>
    post('/v2/promotions/evaluate', { lines });

  // ---------------------------------------------------------------- T-01-02
  describe('T-01-02 — the three discount modes persist (AC-03, AC-04, AC-05)', () => {
    it('AC-03: PERCENT 10% on SKU-685 lands on the reward row', async () => {
      const created = await post(
        '/v2/promotions',
        itemDiscountBody(itemId('SKU-685'), {
          name: 'AC-03 giảm 10% SKU-685',
          groups: [
            {
              ordinal: 0,
              lines: [
                {
                  role: 'REWARD',
                  targetType: 'ITEM',
                  targetId: itemId('SKU-685'),
                  discountMode: 'PERCENT',
                  discountValue: 10,
                  sortOrder: 0,
                },
              ],
            },
          ],
        }),
      ).expect(201);

      expect(created.body.code).toMatch(/^KM\d+$/);

      const [program] = await ds.query<{ type: string }[]>(
        `SELECT type FROM promotion_programs WHERE id = $1::uuid`,
        [created.body.id],
      );
      expect(program.type).toBe('ITEM_DISCOUNT');

      const reward = await rewardRow(created.body.id);
      expect(reward.target_id).toBe(itemId('SKU-685'));
      expect(reward.discount_mode).toBe('PERCENT');
      expect(Number(reward.discount_value)).toBe(10);
    });

    it('AC-04: AMOUNT 50,000đ persists as AMOUNT, not a percentage', async () => {
      const created = await post(
        '/v2/promotions',
        itemDiscountBody(itemId('SKU-685'), {
          name: 'AC-04 giảm 50.000đ',
          groups: [
            {
              ordinal: 0,
              lines: [
                {
                  role: 'REWARD',
                  targetType: 'ITEM',
                  targetId: itemId('SKU-685'),
                  discountMode: 'AMOUNT',
                  discountValue: 50_000,
                  sortOrder: 0,
                },
              ],
            },
          ],
        }),
      ).expect(201);

      const reward = await rewardRow(created.body.id);
      expect(reward.discount_mode).toBe('AMOUNT');
      expect(Number(reward.discount_value)).toBe(50_000);
    });

    it('AC-05: FIXED_PRICE 500,000đ persists and re-prices the line to exactly that', async () => {
      const created = await post(
        '/v2/promotions',
        itemDiscountBody(itemId('SKU-685'), {
          name: 'AC-05 đồng giá 500.000',
          groups: [
            {
              ordinal: 0,
              lines: [
                {
                  role: 'REWARD',
                  targetType: 'ITEM',
                  targetId: itemId('SKU-685'),
                  discountMode: 'FIXED_PRICE',
                  discountValue: 500_000,
                  sortOrder: 0,
                },
              ],
            },
          ],
        }),
      ).expect(201);

      const reward = await rewardRow(created.body.id);
      expect(reward.discount_mode).toBe('FIXED_PRICE');
      expect(Number(reward.discount_value)).toBe(500_000);

      // 685,000 marked down to a flat 500,000 ⇒ 185,000 off.
      const res = await evaluate([
        { lineId: 'l1', itemId: itemId('SKU-685'), quantity: 1, unitPrice: 685_000 },
      ]).expect(201);

      const applied = res.body.appliedPrograms.find((p: { programId: string }) => p.programId === created.body.id);
      expect(applied).toBeDefined();
      expect(applied.discountAmount).toBe(185_000);
      expect(applied.lineDiscounts[0].unitPriceAfter).toBe(500_000);
    });
  });

  // ---------------------------------------------------------------- T-01-03
  describe('T-01-03 — category reach, round-trip, immutable type (AC-06, AC-07, AC-08)', () => {
    /** Same shape as itemDiscountBody but targeting a CATEGORY instead of an ITEM. */
    const categoryDiscountBody = (categoryId: string) => ({
      type: 'ITEM_DISCOUNT',
      name: 'AC-06 giảm 10% theo nhóm cha',
      applyTo: 'ALL_CUSTOMERS',
      autoApply: true,
      priority: 100,
      groups: [
        {
          ordinal: 0,
          lines: [
            {
              role: 'REWARD',
              targetType: 'CATEGORY',
              targetId: categoryId,
              discountMode: 'PERCENT',
              discountValue: 10,
              sortOrder: 0,
            },
          ],
        },
      ],
    });

    it('AC-06: a discount on the parent category reaches an item in the child category', async () => {
      await post('/v2/promotions', categoryDiscountBody(fixtures.parentCategoryId)).expect(201);

      // SKU-685 sits in the CHILD category, so this only passes if the match
      // walks categoryPathIds rather than comparing the leaf id.
      const hit = await evaluate([
        { lineId: 'l1', itemId: itemId('SKU-685'), quantity: 1, unitPrice: 685_000 },
      ]).expect(201);
      expect(hit.body.promotionDiscount).toBe(68_500);

      // SKU-OTHER is outside that tree entirely — the negative half matters just
      // as much, otherwise "matches everything" would pass the case above.
      const miss = await evaluate([
        { lineId: 'l1', itemId: itemId('SKU-OTHER'), quantity: 1, unitPrice: 50_000 },
      ]).expect(201);
      expect(miss.body.promotionDiscount).toBe(0);
    });

    it('AC-07: what was saved comes back unchanged, with no duplicated reward rows', async () => {
      const sent = itemDiscountBody(itemId('SKU-685'), {
        name: 'AC-07 round-trip',
        priority: 42,
        groups: [
          {
            ordinal: 0,
            lines: [
              {
                role: 'REWARD',
                targetType: 'ITEM',
                targetId: itemId('SKU-685'),
                discountMode: 'PERCENT',
                discountValue: 25,
                sortOrder: 0,
              },
            ],
          },
        ],
      });
      const created = await post('/v2/promotions', sent).expect(201);

      const fetched = await get(`/v2/promotions/${created.body.id}`).expect(200);

      expect(fetched.body.type).toBe('ITEM_DISCOUNT');
      expect(fetched.body.name).toBe('AC-07 round-trip');
      expect(fetched.body.priority).toBe(42);
      expect(fetched.body.applyTo).toBe('ALL_CUSTOMERS');
      expect(fetched.body.autoApply).toBe(true);

      // The duplication bug this guards against shows up as 2 rows, not as a
      // wrong value, so assert the count explicitly.
      const rewards = fetched.body.groups[0].lines.filter(
        (l: { role: string }) => l.role === 'REWARD',
      );
      expect(rewards).toHaveLength(1);
      expect(rewards[0]).toMatchObject({
        targetType: 'ITEM',
        targetId: itemId('SKU-685'),
        discountMode: 'PERCENT',
        discountValue: 25,
      });

      const [rowCount] = await ds.query<{ count: string }[]>(
        `SELECT count(*) FROM promotion_lines WHERE program_id = $1::uuid AND role = 'REWARD'`,
        [created.body.id],
      );
      expect(Number(rowCount.count)).toBe(1);
    });

    it('AC-08: type cannot be changed after creation, and the row is left alone', async () => {
      const created = await post(
        '/v2/promotions',
        itemDiscountBody(itemId('SKU-685'), { name: 'AC-08 bất biến' }),
      ).expect(201);

      await put(`/v2/promotions/${created.body.id}`, {
        ...itemDiscountBody(itemId('SKU-685'), { name: 'AC-08 bất biến' }),
        type: 'INVOICE_DISCOUNT',
      }).expect(400);

      const [row] = await ds.query<{ type: string }[]>(
        `SELECT type FROM promotion_programs WHERE id = $1::uuid`,
        [created.body.id],
      );
      expect(row.type).toBe('ITEM_DISCOUNT');
    });
  });

  // ---------------------------------------------------------------- T-01-04
  describe('T-01-04 — the programme actually moves money at the till (AC-09)', () => {
    it('AC-09: 10% off SKU-685 is 68,500 and leaves a unit price of 616,500', async () => {
      const created = await post(
        '/v2/promotions',
        itemDiscountBody(itemId('SKU-685'), {
          name: 'AC-09 giảm 10%',
          groups: [
            {
              ordinal: 0,
              lines: [
                {
                  role: 'REWARD',
                  targetType: 'ITEM',
                  targetId: itemId('SKU-685'),
                  discountMode: 'PERCENT',
                  discountValue: 10,
                  sortOrder: 0,
                },
              ],
            },
          ],
        }),
      ).expect(201);

      const res = await evaluate([
        { lineId: 'l1', itemId: itemId('SKU-685'), quantity: 1, unitPrice: 685_000 },
      ]).expect(201);

      expect(res.body.subtotal).toBe(685_000);
      const applied = res.body.appliedPrograms.find(
        (p: { programId: string }) => p.programId === created.body.id,
      );
      expect(applied.discountAmount).toBe(68_500);
      expect(applied.lineDiscounts[0].unitPriceAfter).toBe(616_500);
      expect(res.body.amountAfterPromotion).toBe(616_500);

      // ITEM_DISCOUNT carries its mode per reward row, never at programme level
      // (see the docblock on AppliedProgram.discountMode). Asserting it stays
      // undefined stops a future "helpful" inference from the first line.
      expect(applied.discountMode).toBeUndefined();
      expect(applied.discountValue).toBeUndefined();
    });
  });
});
