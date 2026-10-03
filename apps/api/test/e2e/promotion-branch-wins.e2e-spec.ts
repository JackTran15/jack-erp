import request from 'supertest';
import { randomUUID } from 'crypto';
import {
  buildCheckoutSagaFixture,
  createUserWithPermissions,
  CheckoutSagaFixture,
  ScopedTestUser,
} from './setup/checkout-saga-fixture';
import { invoiceDiscountBody, itemDiscountBody, seedPromotionFixtures } from './setup/promotion-seed';

/**
 * UOW-03 (2026100301 T-03-02): "branch wins" through the real evaluate
 * endpoint. The fixture's main branch plays HCM; a second branch plays HN.
 *
 * The branch program is created by a branch-manager token through
 * POST /v2/promotions — never inserted raw — so ownership comes from
 * T-01-03's create path exactly as in production. The chain programs come
 * from the seeded admin, which holds `promotion.chain.manage`.
 */
describe('POST /v2/promotions/evaluate — branch wins (E2E, 2026100301 T-03-02)', () => {
  let fx: CheckoutSagaFixture;
  let hnBranchId: string;
  let hcmManager: ScopedTestUser;
  let hcmCashier: ScopedTestUser;
  let hnCashier: ScopedTestUser;
  let chainA: string;
  let branchB: string;

  const PRICE = 100_000;
  const itemProgram = (percent: number, priority: number, name: string) =>
    itemDiscountBody(fx.itemId, {
      name,
      priority,
      groups: [
        {
          ordinal: 0,
          lines: [
            { role: 'REWARD', targetType: 'ITEM', targetId: fx.itemId, discountMode: 'PERCENT', discountValue: percent, sortOrder: 0 },
          ],
        },
      ],
    });

  const create = async (headers: Record<string, string>, body: object): Promise<string> => {
    const res = await request(fx.app.getHttpServer()).post('/v2/promotions').set(headers).send(body).expect(201);
    return res.body.id as string;
  };

  const evaluate = (user: ScopedTestUser, extra: Record<string, unknown> = {}) =>
    request(fx.app.getHttpServer())
      .post('/v2/promotions/evaluate')
      .set(user.headers())
      .send({ lines: [{ lineId: 'L1', itemId: fx.itemId, quantity: 1, unitPrice: PRICE }], ...extra })
      .expect(201);

  const applied = (body: any) => body.appliedPrograms.map((p: { programId: string }) => p.programId);
  const skippedAs = (body: any, programId: string) =>
    body.skippedPrograms.find((p: { programId: string }) => p.programId === programId);

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    await seedPromotionFixtures(fx.app, { organizationId: fx.seed.organizationId, userId: fx.seed.userId });

    hnBranchId = randomUUID();
    await fx.ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Hà Nội', 'ACTIVE', false, $3::uuid, NOW(), NOW())`,
      [hnBranchId, fx.seed.organizationId, fx.seed.userId],
    );

    const hcm = { organizationId: fx.seed.organizationId, branchId: fx.seed.branchId };
    hcmManager = await createUserWithPermissions(fx.app, hcm, ['promotion.read', 'promotion.write', 'promotion.delete']);
    hcmCashier = await createUserWithPermissions(fx.app, hcm, ['pos.promotion.evaluate']);
    hnCashier = await createUserWithPermissions(
      fx.app,
      { organizationId: fx.seed.organizationId, branchId: hnBranchId },
      ['pos.promotion.evaluate'],
    );

    // A wins on priority alone; only the ownership tier can make B beat it.
    chainA = await create(fx.headers(), itemProgram(10, 1, 'Chuỗi giảm 10%'));
    branchB = await create(hcmManager.headers(), itemProgram(20, 100, 'HCM giảm 20%'));
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  }, 120_000);

  it('creates B as an HCM-owned program pinned to HCM, A as a chain program', async () => {
    const b = await request(fx.app.getHttpServer()).get(`/v2/promotions/${branchB}`).set(fx.headers()).expect(200);
    expect(b.body.ownerBranchId).toBe(fx.seed.branchId);
    expect(b.body.branchIds).toEqual([fx.seed.branchId]);

    const a = await request(fx.app.getHttpServer()).get(`/v2/promotions/${chainA}`).set(fx.headers()).expect(200);
    expect(a.body.ownerBranchId).toBeNull();
  });

  it('AC-16: at HCM the HCM program takes the line from the better-priority chain program', async () => {
    const res = await evaluate(hcmCashier);

    expect(applied(res.body)).toEqual([branchB]);
    expect(res.body.promotionDiscount).toBe(20_000);
    expect(skippedAs(res.body, chainA)).toMatchObject({ reason: 'RESOURCE_TAKEN', takenBy: branchB });
  });

  it('AC-17: at HN the HCM program is out of scope and the chain program applies', async () => {
    const res = await evaluate(hnCashier);

    expect(applied(res.body)).toEqual([chainA]);
    expect(res.body.promotionDiscount).toBe(10_000);
    expect(skippedAs(res.body, branchB)).toMatchObject({ reason: 'BRANCH_SCOPE' });
  });

  it('AC-18: a chain program the cashier selected still wins at HCM', async () => {
    const res = await evaluate(hcmCashier, { selectedProgramIds: [chainA] });

    expect(applied(res.body)).toEqual([chainA]);
    expect(skippedAs(res.body, branchB)).toMatchObject({ reason: 'RESOURCE_TAKEN', takenBy: chainA });
  });

  it('AC-19: at HCM the invoice slot goes to the HCM INVOICE_DISCOUNT', async () => {
    // Created here, after AC-16..18, so the invoice slot does not cloud their totals.
    const chainC = await create(fx.headers(), invoiceDiscountBody({ name: 'Chuỗi HĐ 10%', priority: 1, discountValue: 10 }));
    const branchD = await create(hcmManager.headers(), invoiceDiscountBody({ name: 'HCM HĐ 5%', priority: 100, discountValue: 5 }));

    const res = await evaluate(hcmCashier);

    expect(applied(res.body)).toContain(branchD);
    expect(applied(res.body)).not.toContain(chainC);
    expect(skippedAs(res.body, chainC)).toMatchObject({ reason: 'RESOURCE_TAKEN', takenBy: branchD });
  });
});
