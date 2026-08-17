import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  buildCheckoutSagaFixture,
  createUserWithPermissions,
  CheckoutSagaFixture,
} from './setup/checkout-saga-fixture';
import { itemDiscountBody, seedPromotionFixtures } from './setup/promotion-seed';

/**
 * UOW-01 e2e (T-01-06) — proves the two things `pos-web` cannot: that a
 * cashier's own token (not the back-office `promotion.read`) is enough to
 * call `evaluate`, and that the discount it returns is the number the server
 * computed, not something the client could have faked.
 *
 * Runs against tokens minted per-case by `createUserWithPermissions` rather
 * than the shared fixture's admin token — the point of this suite is the
 * `PermissionGuard` check itself (ADR-05), not the discount math (already
 * covered exhaustively by the promotion-programs-engine suite). A test that
 * ran as admin would stay green even if the STAFF grant in
 * `org-role-permissions.ts` were reverted — see T-01-02's note on why that
 * criterion moved here.
 */
describe('POST /v2/promotions/evaluate — POS permission + amounts (E2E, T-01-06)', () => {
  let fx: CheckoutSagaFixture;
  let ds: DataSource;
  let itemId: string;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    ds = fx.ds;
    await seedPromotionFixtures(fx.app, {
      organizationId: fx.seed.organizationId,
      userId: fx.seed.userId,
    });

    // 1.495.000 / 30% off is the exact pair AC-01 and 00-intent.md's success
    // signal are stated against, taken from MISA invoice `2608050001` — kept
    // literal here instead of reusing promotion-seed's 685_000 catalogue so
    // the assertion can be checked by hand against that invoice.
    const itemRes = await request(fx.app.getHttpServer())
      .post('/inventory/items')
      .set(fx.headers())
      .send({ code: 'AKSK27096-BO-39', name: 'Giày nam onsale', unit: 'PCS', purchasePrice: 900_000, sellingPrice: 1_495_000 })
      .expect(201);
    itemId = itemRes.body.id;

    await request(fx.app.getHttpServer())
      .post('/v2/promotions')
      .set(fx.headers())
      .send(itemDiscountBody(itemId, { name: 'GIÀY NAM ONSALE 30%' }))
      .expect(201);
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  }, 120_000);

  const evaluateBody = () => ({
    lines: [{ lineId: 'L1', itemId, quantity: 1, unitPrice: 1_495_000 }],
  });

  it('a STAFF token holding only pos.promotion.evaluate gets 200 with the server-computed discount', async () => {
    const staff = await createUserWithPermissions(
      fx.app,
      { organizationId: fx.seed.organizationId, branchId: fx.seed.branchId },
      ['pos.promotion.evaluate'],
    );

    const res = await request(fx.app.getHttpServer())
      .post('/v2/promotions/evaluate')
      .set(staff.headers())
      .send(evaluateBody())
      .expect(201);

    expect(res.body.promotionDiscount).toBe(448_500);
    expect(res.body.amountAfterPromotion).toBe(1_046_500);
  });

  it('a token with neither promotion.read nor pos.promotion.evaluate still gets 403 — the guard is not wide open', async () => {
    const bare = await createUserWithPermissions(
      fx.app,
      { organizationId: fx.seed.organizationId, branchId: fx.seed.branchId },
      [],
    );

    await request(fx.app.getHttpServer())
      .post('/v2/promotions/evaluate')
      .set(bare.headers())
      .send(evaluateBody())
      .expect(403);
  });

  it('a back-office token holding only promotion.read still gets 200 — the pre-existing path is unbroken', async () => {
    const backoffice = await createUserWithPermissions(
      fx.app,
      { organizationId: fx.seed.organizationId, branchId: fx.seed.branchId },
      ['promotion.read'],
    );

    await request(fx.app.getHttpServer())
      .post('/v2/promotions/evaluate')
      .set(backoffice.headers())
      .send(evaluateBody())
      .expect(201);
  });
});
