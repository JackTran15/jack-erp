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
 * 2026092102 / T-01-01 (AC-01) — `evaluate` carries `type` on every skipped
 * program and `description` on all three groups, so the POS modal can print
 * "Hình thức" and "Mô tả" for a row the cashier has just un-ticked, not only
 * for the applied ones. Everything the response carried before stays as it
 * was: the change is additive.
 */
describe('POST /v2/promotions/evaluate — program type + description on every group (e2e, T-01-01)', () => {
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

  const evaluate = (body: unknown) =>
    request(app.getHttpServer())
      .post('/v2/promotions/evaluate')
      .set('Authorization', authHeader(base.accessToken))
      .set('X-Branch-Id', base.branchId)
      .send(body as object);

  const line = (code: string, quantity: number, unitPrice: number) => ({
    lineId: code,
    itemId: itemId(code),
    quantity,
    unitPrice,
  });

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
  }, 300_000);

  afterAll(async () => {
    await app?.close();
  }, 120_000);

  beforeEach(clearPrograms);

  it('AC-01: applied / available / skipped rows all carry type and description; old fields unchanged', async () => {
    const applied = await createProgram(
      itemDiscountBody(itemId('SKU-685'), { name: 'Giảm giá hàng hóa 30%', description: 'Áp cho giày nữ' }),
    );
    // autoApply=false and eligible ⇒ listed under `availablePrograms` and
    // skipped with NOT_SELECTED.
    const available = await createProgram(
      invoiceDiscountBody({ name: 'Giảm giá hóa đơn 10%', description: 'Chỉ khi thu ngân chọn', autoApply: false }),
    );
    // Excluded by the cashier ⇒ skipped with EXCLUDED_BY_CASHIER. A second
    // ITEM_DISCOUNT on a different SKU so it does not contend with `applied`.
    const excluded = await createProgram(
      itemDiscountBody(itemId('SKU-100'), { name: 'Giảm giá phụ kiện 30%', description: 'Phụ kiện' }),
    );

    const res = await evaluate({
      lines: [line('SKU-685', 1, 685_000), line('SKU-100', 1, 100_000)],
      excludedProgramIds: [excluded.body.id],
    }).expect(201);

    expect(res.body.appliedPrograms).toHaveLength(1);
    expect(res.body.appliedPrograms[0]).toMatchObject({
      programId: applied.body.id,
      code: applied.body.code,
      name: 'Giảm giá hàng hóa 30%',
      type: 'ITEM_DISCOUNT',
      priority: 100,
      discountAmount: 205_500,
      description: 'Áp cho giày nữ',
    });
    expect(res.body.appliedPrograms[0].lineDiscounts).toEqual([
      { lineId: 'SKU-685', discountAmount: 205_500, unitPriceAfter: 479_500 },
    ]);
    expect(res.body.appliedPrograms[0].gifts).toEqual([]);

    expect(res.body.availablePrograms).toHaveLength(1);
    expect(res.body.availablePrograms[0]).toMatchObject({
      programId: available.body.id,
      code: available.body.code,
      name: 'Giảm giá hóa đơn 10%',
      type: 'INVOICE_DISCOUNT',
      autoApply: false,
      description: 'Chỉ khi thu ngân chọn',
    });
    expect(typeof res.body.availablePrograms[0].estimatedDiscount).toBe('number');

    const byId = (id: string) => res.body.skippedPrograms.find((s: { programId: string }) => s.programId === id);
    expect(byId(excluded.body.id)).toEqual({
      programId: excluded.body.id,
      name: 'Giảm giá phụ kiện 30%',
      type: 'ITEM_DISCOUNT',
      description: 'Phụ kiện',
      reason: 'EXCLUDED_BY_CASHIER',
    });
    expect(byId(available.body.id)).toEqual({
      programId: available.body.id,
      name: 'Giảm giá hóa đơn 10%',
      type: 'INVOICE_DISCOUNT',
      description: 'Chỉ khi thu ngân chọn',
      reason: 'NOT_SELECTED',
    });

    // The totals are what they were before the fields were added.
    expect(res.body.subtotal).toBe(785_000);
    expect(res.body.promotionDiscount).toBe(205_500);
    expect(res.body.amountAfterPromotion).toBe(579_500);
  });

  it('AC-01: a program without a description still carries its type, and description is absent rather than empty', async () => {
    const program = await createProgram(itemDiscountBody(itemId('SKU-685')));

    const res = await evaluate({
      lines: [line('SKU-685', 1, 685_000)],
      excludedProgramIds: [program.body.id],
    }).expect(201);

    expect(res.body.appliedPrograms).toHaveLength(0);
    expect(res.body.skippedPrograms).toHaveLength(1);
    expect(res.body.skippedPrograms[0]).toMatchObject({
      programId: program.body.id,
      type: 'ITEM_DISCOUNT',
      reason: 'EXCLUDED_BY_CASHIER',
    });
    expect(res.body.skippedPrograms[0].description).toBeUndefined();
  });

  it('AC-01: a CONDITION_NOT_MET skip carries type and description too', async () => {
    // A 30% on SKU-100 evaluated against a cart that only holds SKU-685.
    const program = await createProgram(
      itemDiscountBody(itemId('SKU-100'), { name: 'Giảm giá phụ kiện 30%', description: 'Phụ kiện' }),
    );

    const res = await evaluate({ lines: [line('SKU-685', 1, 685_000)] }).expect(201);

    expect(res.body.skippedPrograms).toContainEqual({
      programId: program.body.id,
      name: 'Giảm giá phụ kiện 30%',
      type: 'ITEM_DISCOUNT',
      description: 'Phụ kiện',
      reason: 'CONDITION_NOT_MET',
    });
  });
});
