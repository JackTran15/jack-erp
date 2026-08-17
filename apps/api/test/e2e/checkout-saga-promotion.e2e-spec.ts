import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';
import { itemDiscountBody, giftItemBody, seedPromotionFixtures } from './setup/promotion-seed';

/**
 * UOW-04 e2e (T-04-07) — AC-19 (server-computed discount, client numbers
 * ignored) and AC-20 (gift lines deduct stock without inflating revenue),
 * plus a STOPPED program producing zero effect on a real checkout.
 *
 * Its own file rather than an addition to checkout-saga.e2e-spec.ts (already
 * the AC-01..18 parity suite) — this one is additive and promotion-specific,
 * matching the ticket's own `touches` list.
 */
describe('Checkout Saga v2 — promotions (E2E, T-04-07)', () => {
  let fx: CheckoutSagaFixture;
  let ds: DataSource;
  let giftItemId: string;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    ds = fx.ds;

    await seedPromotionFixtures(fx.app, {
      organizationId: fx.seed.organizationId,
      userId: fx.seed.userId,
    });

    // persist-invoice's gift-line location resolution (T-04-04) needs a real
    // showroom (a main storage + its "Mặc định" default location) to fall
    // back to. The shared checkout-saga fixture's own "Checkout WH" storage
    // is deliberately non-main (see A-30) — every *ordinary* line in the
    // other checkout-saga specs works around that by sending an explicit
    // `locationId` on the draft. A gift item has no such client-supplied
    // fallback, so this file adds its own showroom, additively: it does not
    // touch the shared fixture and has no effect on any other spec file
    // (each gets its own fresh app + database from buildCheckoutSagaFixture()).
    const showroom = await request(fx.app.getHttpServer())
      .post('/inventory/storages')
      .set(fx.headers())
      .send({ name: 'Showroom E2E', branchId: fx.seed.branchId, isMainStorage: true })
      .expect(201);
    const defaultLoc = await request(fx.app.getHttpServer())
      .post('/inventory/locations')
      .set(fx.headers())
      .send({
        code: 'SHOWROOM-DEFAULT',
        name: 'Showroom Default',
        storageId: showroom.body.id,
        branchId: fx.seed.branchId,
      })
      .expect(201);
    // No API exposes `isDefault` on a location (CreateLocationDto doesn't
    // declare the field) — set it directly, same as other e2e fixtures do
    // for knobs the API doesn't expose.
    await ds.query(`UPDATE locations SET is_default = true WHERE id = $1`, [defaultLoc.body.id]);

    const giftItemRes = await request(fx.app.getHttpServer())
      .post('/inventory/items')
      .set(fx.headers())
      .send({ code: 'GIFT-E2E-1', name: 'Quà tặng E2E', unit: 'PCS', purchasePrice: 9000, sellingPrice: 15000 })
      .expect(201);
    giftItemId = giftItemRes.body.id;
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  }, 120_000);

  /** Each test owns its programs; wiping between them mirrors promotion-evaluate.e2e-spec.ts. */
  const clearPrograms = async () => {
    await ds.query('DELETE FROM promotion_lines');
    await ds.query('DELETE FROM promotion_tiers');
    await ds.query('DELETE FROM promotion_conditions');
    await ds.query('DELETE FROM promotion_branches');
    await ds.query('DELETE FROM promotion_customer_groups');
    await ds.query('DELETE FROM promotion_groups');
    await ds.query('DELETE FROM promotion_programs');
  };
  beforeEach(clearPrograms);

  const createProgram = (body: unknown) =>
    request(fx.app.getHttpServer()).post('/v2/promotions').set(fx.headers()).send(body as object).expect(201);

  const createDraft = async (lines: Array<{ itemId: string; unitPrice: number; quantity?: number }>) => {
    const res = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: fx.customerId,
        items: lines.map((l) => ({
          itemId: l.itemId,
          locationId: fx.locationId,
          itemCode: 'ITEM',
          itemName: 'Item',
          unit: 'PCS',
          quantity: l.quantity ?? 1,
          unitPrice: l.unitPrice,
        })),
      })
      .expect(201);
    return res.body.id as string;
  };

  const checkout = (invoiceId: string, overrides: Record<string, unknown> = {}) =>
    request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 200000 }], ...overrides });

  /** Mirrors `promotion-evaluate.e2e-spec.ts`'s helper, on this file's own fixture. */
  const evaluate = (body: unknown) =>
    request(fx.app.getHttpServer())
      .post('/v2/promotions/evaluate')
      .set(fx.headers())
      .send(body as object);

  const revenueCredit = async (invoiceId: string): Promise<number> => {
    const [row] = await ds.query(
      `SELECT jl.credit_amount FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.source_reference_id = $1 AND jl.credit_amount > 0`,
      [invoiceId],
    );
    return Number(row.credit_amount);
  };

  it('AC-19: a forged discountAmount has no channel into the request at all — the whitelist rejects it outright', async () => {
    const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }]);
    const res = await checkout(invoiceId, {
      payments: [{ paymentMethod: 'cash', amount: 479500 }],
      discountAmount: 999999,
    });
    // CheckoutV2Dto never declares `discountAmount`; forbidNonWhitelisted (global
    // ValidationPipe) rejects it before the saga ever runs — a stronger proof of
    // A-04 than "the engine's number wins": there is no field for a client
    // number to land in to begin with.
    expect(res.status).toBe(400);
  });

  it('AC-19: server recomputes a 30% ITEM_DISCOUNT itself, and snapshots it on invoice_checkout_promotions', async () => {
    const program = await createProgram(itemDiscountBody(fx.itemId3));
    const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }]);

    const res = await checkout(invoiceId, {
      payments: [{ paymentMethod: 'cash', amount: 479500 }], // 685000 - 205500 (30%)
    }).expect(201);
    expect(res.body.committed).toBe(true);

    const [invoice] = await ds.query(
      `SELECT discount_amount, status FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(Number(invoice.discount_amount)).toBe(205500);
    expect(invoice.status).toBe('paid');

    const [snapshot] = await ds.query(
      `SELECT program_id, code, name, type, priority, discount_amount, line_discounts
       FROM invoice_checkout_promotions WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(snapshot).toMatchObject({
      program_id: program.body.id,
      code: program.body.code,
      name: 'Giảm giá hàng hóa 30%',
      type: 'ITEM_DISCOUNT',
      priority: 100,
    });
    expect(Number(snapshot.discount_amount)).toBe(205500);
    expect(snapshot.line_discounts).toHaveLength(1);
  });

  it('AC-20: a GIFT_ITEM program adds an is_gift line, deducts its stock, and leaves revenue unchanged', async () => {
    const withoutGiftInvoice = await createDraft([{ itemId: fx.itemId2, unitPrice: 200000 }]);
    expect((await checkout(withoutGiftInvoice).expect(201)).body.committed).toBe(true);

    const program = await createProgram(
      giftItemBody(giftItemId, {
        condition: {
          type: 'MIN_INVOICE_AMOUNT',
          minAmount: 200_000,
          calcBasis: 'ALL_ITEMS',
          multiplyGift: false, // deterministic 1x reward regardless of how far over minAmount
        },
      }),
    );
    const withGiftInvoice = await createDraft([{ itemId: fx.itemId2, unitPrice: 200000 }]);
    expect((await checkout(withGiftInvoice).expect(201)).body.committed).toBe(true);

    const giftLines = await ds.query(
      `SELECT item_id, unit_price, line_total, is_gift, promotion_program_id
       FROM invoice_items WHERE invoice_id = $1 AND is_gift = true`,
      [withGiftInvoice],
    );
    expect(giftLines).toHaveLength(1);
    expect(giftLines[0]).toMatchObject({ item_id: giftItemId, promotion_program_id: program.body.id });
    expect(Number(giftLines[0].unit_price)).toBe(0);
    expect(Number(giftLines[0].line_total)).toBe(0);

    const giftLedger = await ds.query(
      `SELECT movement_type, quantity FROM stock_ledger_entries WHERE reference_id = $1 AND item_id = $2`,
      [withGiftInvoice, giftItemId],
    );
    expect(giftLedger).toHaveLength(1);
    expect(giftLedger[0].movement_type).toBe('SALE_ISSUE');
    expect(Number(giftLedger[0].quantity)).toBeLessThan(0);

    // AC-20's core claim: the free gift does not inflate revenue. Both
    // invoices sell the identical 200000 line; the gift line's own unitPrice
    // is 0 and never enters `compute-totals`' subtotal (it doesn't exist on
    // the invoice yet when that preflight step runs) — so the two credits
    // must be identical.
    expect(await revenueCredit(withGiftInvoice)).toBe(await revenueCredit(withoutGiftInvoice));
    expect(await revenueCredit(withGiftInvoice)).toBe(200000);
  });

  it('a STOPPED program has zero effect on a real checkout', async () => {
    const program = await createProgram(itemDiscountBody(fx.itemId3));
    await request(fx.app.getHttpServer())
      .patch(`/v2/promotions/${program.body.id}/status`)
      .set(fx.headers())
      .send({ status: 'STOPPED' })
      .expect(200);

    const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }]);
    const res = await checkout(invoiceId, {
      payments: [{ paymentMethod: 'cash', amount: 685000 }],
    }).expect(201);
    expect(res.body.committed).toBe(true);

    const [invoice] = await ds.query(`SELECT discount_amount FROM invoices WHERE id = $1`, [invoiceId]);
    expect(Number(invoice.discount_amount)).toBe(0);

    const snapshots = await ds.query(
      `SELECT * FROM invoice_checkout_promotions WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(snapshots).toHaveLength(0);
  });

  /**
   * UOW-02 e2e (T-02-05) — the cashier's manual pick (`selectedProgramIds`)
   * actually changes what gets committed, not just accepted. Case 1 and 2
   * share the exact same fixture and only differ in one field, per the
   * ticket's own done-when.
   */
  describe('AC-10: auto_apply=false programs only run when selected', () => {
    it('case 1 — not selected: the eligible optional program has zero effect', async () => {
      await createProgram(itemDiscountBody(fx.itemId3, { autoApply: false }));
      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }]);

      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 685000 }],
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const [invoice] = await ds.query(`SELECT discount_amount FROM invoices WHERE id = $1`, [
        invoiceId,
      ]);
      expect(Number(invoice.discount_amount)).toBe(0);

      const snapshots = await ds.query(
        `SELECT * FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshots).toHaveLength(0);
    });

    it('case 2 — selected: runs, and the committed discountAmount equals what evaluate() quoted for the same cart', async () => {
      const program = await createProgram(itemDiscountBody(fx.itemId3, { autoApply: false }));

      // Same cart, same program — `evaluate` is the pre-payment quote the
      // cashier saw in the dialog; the saga must land on the identical number.
      const previewLine = { lineId: 'l1', itemId: fx.itemId3, quantity: 1, unitPrice: 685000 };
      const preview = await evaluate({
        lines: [previewLine],
        selectedProgramIds: [program.body.id],
      }).expect(201);
      expect(preview.body.promotionDiscount).toBe(205500); // 30% of 685000

      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }]);
      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 479500 }], // 685000 - 205500
        selectedProgramIds: [program.body.id],
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const [invoice] = await ds.query(`SELECT discount_amount FROM invoices WHERE id = $1`, [
        invoiceId,
      ]);
      expect(Number(invoice.discount_amount)).toBe(preview.body.promotionDiscount);

      const [snapshot] = await ds.query(
        `SELECT program_id, discount_amount FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshot.program_id).toBe(program.body.id);
      expect(Number(snapshot.discount_amount)).toBe(preview.body.promotionDiscount);

      // T-08-01 — the same snapshot must be readable back through the API,
      // not just visible via a direct DB query (the whole point of the ticket:
      // invoice_checkout_promotions was write-only before this).
      const getRes = await request(fx.app.getHttpServer())
        .get(`/invoices/${invoiceId}`)
        .set(fx.headers())
        .expect(200);
      expect(getRes.body.appliedPromotions).toEqual([
        { type: 'ITEM_DISCOUNT', discountAmount: preview.body.promotionDiscount },
      ]);
    });

    /**
     * Ticket originally planned this as "unknown id ⇒ 422". Verified against
     * the actual code before writing the assertion (not just the plan):
     * `CheckoutV2Dto.selectedProgramIds` only validates UUID *shape*
     * (`@IsUUID('4', { each: true })`, `checkout-v2.dto.ts`), and
     * `PromotionResolver` (`promotion-resolver.ts:48-49`) merely filters
     * eligible programs by id membership — a well-formed id that matches no
     * eligible program is never treated as an error, just never selected.
     * There genuinely is no 422 path here. Testing that instead: a phantom
     * id must not crash checkout or silently apply *something* — it has to
     * be a true no-op, same shape as case 1.
     */
    it('case 3 — a well-formed but non-existent program id is a silent no-op, not an error', async () => {
      await createProgram(itemDiscountBody(fx.itemId3, { autoApply: false }));
      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }]);

      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 685000 }],
        selectedProgramIds: [randomUUID()],
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const [invoice] = await ds.query(`SELECT discount_amount FROM invoices WHERE id = $1`, [
        invoiceId,
      ]);
      expect(Number(invoice.discount_amount)).toBe(0);

      const snapshots = await ds.query(
        `SELECT * FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshots).toHaveLength(0);
    });
  });

  /**
   * UOW-04 e2e (T-04-04) — proves T-04-01's resolver-level override (unit
   * tested in promotion-resolver.spec.ts, T-04-02) actually reaches a real
   * checkout: the swapped-in program, not the priority winner, is what gets
   * written to `invoices`/`invoice_items`/`invoice_checkout_promotions`.
   *
   * Fixture and expected numbers mirror UOW-04's own demo script (real MISA
   * experiment, 06/08/2026): two ITEM_DISCOUNT programs on one SKU, A 30%
   * priority 10, B 50% priority 20, on a 1,495,000 line.
   */
  describe('AC-11: selectedProgramIds overrides which competing program wins', () => {
    const competingPrograms = () => [
      createProgram(
        itemDiscountBody(fx.itemId3, {
          name: 'A',
          priority: 10,
          groups: [
            {
              ordinal: 0,
              lines: [
                { role: 'REWARD', targetType: 'ITEM', targetId: fx.itemId3, discountMode: 'PERCENT', discountValue: 30, sortOrder: 0 },
              ],
            },
          ],
        }),
      ),
      createProgram(
        itemDiscountBody(fx.itemId3, {
          name: 'B',
          priority: 20,
          groups: [
            {
              ordinal: 0,
              lines: [
                { role: 'REWARD', targetType: 'ITEM', targetId: fx.itemId3, discountMode: 'PERCENT', discountValue: 50, sortOrder: 0 },
              ],
            },
          ],
        }),
      ),
    ];

    it('case 1 — no selectedProgramIds: priority still decides, invoice records A (30%)', async () => {
      const [programA] = await Promise.all(competingPrograms());
      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 1_495_000 }]);

      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 1_046_500 }], // 1,495,000 - 448,500 (30%)
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const [invoice] = await ds.query(`SELECT discount_amount FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invoice.discount_amount)).toBe(448_500);

      const [snapshot] = await ds.query(
        `SELECT program_id, discount_amount FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshot.program_id).toBe(programA.body.id);
      expect(Number(snapshot.discount_amount)).toBe(448_500);
    });

    it('case 2 — selectedProgramIds: [B] overrides priority: invoice records B (50%), no trace of A', async () => {
      const [, programB] = await Promise.all(competingPrograms());
      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 1_495_000 }]);

      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 747_500 }], // 1,495,000 - 747,500 (50%)
        selectedProgramIds: [programB.body.id],
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const [invoice] = await ds.query(`SELECT discount_amount FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invoice.discount_amount)).toBe(747_500);

      // Exactly one snapshot row, and it's B — an ITEM_DISCOUNT program never
      // creates its own invoice_items row (that's gift-only, see
      // persist-invoice.step.ts), so "no trace of A" is proven here: a losing
      // program that had been swapped out gets no snapshot row at all, not a
      // second row with a zero amount.
      const snapshots = await ds.query(
        `SELECT program_id, discount_amount, line_discounts FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].program_id).toBe(programB.body.id);
      expect(Number(snapshots[0].discount_amount)).toBe(747_500);
      // Line-level proof it's genuinely B's 50% and not A's 30% that landed
      // on the cart line, not just the invoice-level aggregate.
      expect(snapshots[0].line_discounts).toEqual([
        expect.objectContaining({ discountAmount: 747_500 }),
      ]);
    });
  });

  /**
   * UOW-09 e2e (T-09-05) — proves T-09-01's resolver-level exclusion (unit
   * tested in promotion-resolver.spec.ts) and T-09-02's checkout-saga forward
   * (unit tested in evaluate-promotion.step.spec.ts) together reach a real
   * checkout: an excluded auto_apply program is not committed, even though
   * it's eligible and would otherwise win.
   */
  describe('AC-36: excludedProgramIds keeps an excluded program off the committed invoice', () => {
    it('case 1 — no excludedProgramIds: the eligible auto_apply program applies normally', async () => {
      const program = await createProgram(itemDiscountBody(fx.itemId3));
      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }]);

      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 479500 }], // 685000 - 205500 (30%)
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const [invoice] = await ds.query(`SELECT discount_amount FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invoice.discount_amount)).toBe(205500);

      const [snapshot] = await ds.query(
        `SELECT program_id FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshot.program_id).toBe(program.body.id);
    });

    it('case 2 — excludedProgramIds: [program]: no discount, no snapshot, even though it was eligible and auto_apply', async () => {
      const program = await createProgram(itemDiscountBody(fx.itemId3));
      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }]);

      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 685000 }], // full price — no discount applied
        excludedProgramIds: [program.body.id],
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const [invoice] = await ds.query(`SELECT discount_amount FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invoice.discount_amount)).toBe(0);

      const snapshots = await ds.query(
        `SELECT * FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshots).toHaveLength(0);
    });

    /**
     * A 2-program contest (same shape as `AC-11` above), resolved through
     * `excludedProgramIds` ALONE — no `selectedProgramIds` at all. Distinct
     * from `AC-11 case 2`: that test proves `selectedProgramIds` can override
     * priority; this one proves `excludedProgramIds` can remove the priority
     * winner from the race entirely, letting the runner-up win by default —
     * a genuinely different code path (checked before `selectedProgramIds`
     * is even consulted — see `promotion-resolver.ts`'s exclusion filter).
     */
    it('case 3 — excludedProgramIds alone removes the priority winner, the runner-up wins by default', async () => {
      const programA = await createProgram(
        itemDiscountBody(fx.itemId3, {
          name: 'A',
          priority: 10,
          groups: [
            {
              ordinal: 0,
              lines: [
                { role: 'REWARD', targetType: 'ITEM', targetId: fx.itemId3, discountMode: 'PERCENT', discountValue: 30, sortOrder: 0 },
              ],
            },
          ],
        }),
      );
      const programB = await createProgram(
        itemDiscountBody(fx.itemId3, {
          name: 'B',
          priority: 20,
          groups: [
            {
              ordinal: 0,
              lines: [
                { role: 'REWARD', targetType: 'ITEM', targetId: fx.itemId3, discountMode: 'PERCENT', discountValue: 50, sortOrder: 0 },
              ],
            },
          ],
        }),
      );
      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 1_495_000 }]);

      // No selectedProgramIds — A (priority 10) would win by default (see
      // AC-11 case 1's identical fixture). Excluding A alone is what makes B
      // the winner here, not an override.
      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 747_500 }], // 1,495,000 - 747,500 (50%, B)
        excludedProgramIds: [programA.body.id],
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const snapshots = await ds.query(
        `SELECT program_id, discount_amount FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].program_id).toBe(programB.body.id);
      expect(Number(snapshots[0].discount_amount)).toBe(747_500);
    });

    /**
     * Regression (AC-37) at the checkout layer, mirroring `AC-11 case 2`
     * exactly but with an explicit empty `excludedProgramIds` in the DTO —
     * proves the new field's mere presence (empty) doesn't disturb UOW-04's
     * `selectedProgramIds` override.
     */
    it('case 4 — empty excludedProgramIds does not disturb a selectedProgramIds override (UOW-04 regression)', async () => {
      // A (priority 10, the winner being overridden) is created but never
      // referenced by id — its only job is to be the competing program B's
      // override has to beat, same fixture shape as AC-11 case 2.
      await createProgram(
        itemDiscountBody(fx.itemId3, {
          name: 'A',
          priority: 10,
          groups: [
            {
              ordinal: 0,
              lines: [
                { role: 'REWARD', targetType: 'ITEM', targetId: fx.itemId3, discountMode: 'PERCENT', discountValue: 30, sortOrder: 0 },
              ],
            },
          ],
        }),
      );
      const programB = await createProgram(
        itemDiscountBody(fx.itemId3, {
          name: 'B',
          priority: 20,
          groups: [
            {
              ordinal: 0,
              lines: [
                { role: 'REWARD', targetType: 'ITEM', targetId: fx.itemId3, discountMode: 'PERCENT', discountValue: 50, sortOrder: 0 },
              ],
            },
          ],
        }),
      );
      const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 1_495_000 }]);

      const res = await checkout(invoiceId, {
        payments: [{ paymentMethod: 'cash', amount: 747_500 }], // 1,495,000 - 747,500 (50%, B)
        selectedProgramIds: [programB.body.id],
        excludedProgramIds: [],
      }).expect(201);
      expect(res.body.committed).toBe(true);

      const snapshots = await ds.query(
        `SELECT program_id, discount_amount FROM invoice_checkout_promotions WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].program_id).toBe(programB.body.id);
      expect(Number(snapshots[0].discount_amount)).toBe(747_500);
    });
  });
});
