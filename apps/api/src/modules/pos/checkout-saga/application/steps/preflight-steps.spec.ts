import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LoadDraftStep } from './load-draft.step';
import { ResolveAccountsStep } from './resolve-accounts.step';
import { ResolveFundsStep } from './resolve-funds.step';
import { ComputeTotalsStep } from './compute-totals.step';
import { InvoiceStatus, InvoicePaymentMethod } from '../../../entities/invoice.entity';
import { computeAmountDue } from '../../../services/invoice-amount.util';
import { POINT_EARN_VND_PER_POINT } from '../../../../customer/loyalty.constants';
import { CheckoutContext } from '../checkout-step';

/**
 * Official spec for T-01-09, originally covering all five preflight steps.
 * `EvaluatePromotionStep` moved out to its own `evaluate-promotion.step.spec.ts`
 * (T-04-03) once it stopped being a 3-line stub — the other four stay here.
 * The fixture numbers below mirror checkout-invoice.service.spec.ts's
 * `invoiceStub` / `invoiceItemStub` / `cashPaymentDto` (subtotal 200 = qty 2 ×
 * unitPrice 100, discountAmount 0, depositAmount 0, customerId 'cust-1') so
 * the parity test at the bottom is a direct comparison, not a coincidence.
 */

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'c1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    ...overrides,
  };
}

describe('LoadDraftStep', () => {
  const invoiceRepo = { findOne: jest.fn() };
  const itemRepo = { find: jest.fn() };
  const sagaRepo = { findOne: jest.fn() };
  const step = new LoadDraftStep(invoiceRepo as any, itemRepo as any, sagaRepo as any);

  beforeEach(() => jest.clearAllMocks());

  it('AC-04: rejects an unknown invoice with INVOICE_NOT_FOUND', async () => {
    invoiceRepo.findOne.mockResolvedValue(null);
    await expect(step.execute(ctx())).rejects.toMatchObject({
      response: { code: 'INVOICE_NOT_FOUND' },
    });
  });

  it('AC-04: rejects a non-draft invoice with INVOICE_NOT_CHECKOUTABLE when no completed saga matches this idempotency key', async () => {
    invoiceRepo.findOne.mockResolvedValue({ isDraft: false, status: InvoiceStatus.PAID });
    sagaRepo.findOne.mockResolvedValue(null);
    await expect(step.execute(ctx())).rejects.toMatchObject({
      response: { code: 'INVOICE_NOT_CHECKOUTABLE' },
    });
  });

  it('AC-04: rejects a draft with no items', async () => {
    invoiceRepo.findOne.mockResolvedValue({ isDraft: true, status: InvoiceStatus.DRAFT });
    itemRepo.find.mockResolvedValue([]);
    await expect(step.execute(ctx())).rejects.toMatchObject({
      response: { code: 'INVOICE_NOT_CHECKOUTABLE' },
    });
  });

  it('AC-04: rejects a draft with an item missing locationId', async () => {
    invoiceRepo.findOne.mockResolvedValue({ isDraft: true, status: InvoiceStatus.DRAFT });
    itemRepo.find.mockResolvedValue([{ itemId: 'i1', locationId: null }]);
    await expect(step.execute(ctx())).rejects.toMatchObject({
      response: { code: 'INVOICE_NOT_CHECKOUTABLE' },
    });
  });

  it('populates ctx.invoice and ctx.items on a valid draft', async () => {
    const invoice = { id: 'inv-1', isDraft: true, status: InvoiceStatus.DRAFT };
    const items = [{ itemId: 'i1', locationId: 'loc-1', sortOrder: 0 }];
    invoiceRepo.findOne.mockResolvedValue(invoice);
    itemRepo.find.mockResolvedValue(items);

    const c = ctx();
    await step.execute(c);

    expect(c.invoice).toBe(invoice);
    expect(c.items).toBe(items);
  });

  // A-13 amendment (T-02-09): a resubmitted request against an already-committed
  // invoice must reach open-saga's replay logic, not be rejected here.
  it('AC-10: lets a non-draft invoice through when a COMPLETED saga already matches this idempotency key (replay)', async () => {
    const invoice = { id: 'inv-1', isDraft: false, status: InvoiceStatus.PAID };
    const items = [{ itemId: 'i1', locationId: 'loc-1', sortOrder: 0 }];
    invoiceRepo.findOne.mockResolvedValue(invoice);
    itemRepo.find.mockResolvedValue(items);
    sagaRepo.findOne.mockResolvedValue({ id: 'saga-1', status: 'COMPLETED' });

    const c = ctx();
    await step.execute(c);

    expect(sagaRepo.findOne).toHaveBeenCalledWith({
      where: { organizationId: 'o1', idempotencyKey: 'inv-1', status: 'COMPLETED' },
    });
    expect(c.invoice).toBe(invoice);
    expect(c.items).toBe(items);
  });

  it('AC-10: a PENDING or FAILED saga for this idempotency key does not bypass the draft guard — only COMPLETED does', async () => {
    invoiceRepo.findOne.mockResolvedValue({ isDraft: false, status: InvoiceStatus.PAID });
    sagaRepo.findOne.mockResolvedValue(null); // repo query itself filters status: COMPLETED
    await expect(step.execute(ctx())).rejects.toMatchObject({
      response: { code: 'INVOICE_NOT_CHECKOUTABLE' },
    });
  });
});

describe('ResolveAccountsStep', () => {
  it('always resolves REVENUE and swallows a missing RECEIVABLE into undefined', async () => {
    const accountResolver = {
      resolveDefaultAccount: jest.fn(async (role: string) => {
        if (role === 'REVENUE') return 'acct-revenue';
        throw new BadRequestException(
          'No default RECEIVABLE account configured for organization o1',
        );
      }),
      resolvePaymentAccount: jest.fn(async () => ({ accountId: 'acct-cash' })),
    };
    const step = new ResolveAccountsStep(accountResolver as any);
    const c = ctx({
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100 }],
      },
    });

    await step.execute(c);

    expect(c.accounts!.revenueAccountId).toBe('acct-revenue');
    expect(c.accounts!.receivableAccountId).toBeUndefined();
    expect(c.accounts!.perPayment).toEqual([{ accountId: 'acct-cash' }]);
  });

  it('wraps a REVENUE plain-string failure as ACCOUNT_NOT_CONFIGURED (A-22)', async () => {
    const accountResolver = {
      resolveDefaultAccount: jest.fn(async (role: string) => {
        // Real AccountResolverService.resolveDefaultAccount throws exactly this shape.
        throw new BadRequestException(
          `No default ${role} account configured for organization o1`,
        );
      }),
      resolvePaymentAccount: jest.fn(),
    };
    const step = new ResolveAccountsStep(accountResolver as any);

    const err = await step.execute(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({
      code: 'ACCOUNT_NOT_CONFIGURED',
      message: 'No default REVENUE account configured for organization o1',
    });
  });

  it('wraps a per-line payment-account plain-string failure as PAYMENT_ACCOUNT_INVALID (A-22)', async () => {
    const accountResolver = {
      resolveDefaultAccount: jest.fn(async () => 'acct-revenue'),
      resolvePaymentAccount: jest.fn(async () => {
        // Real AccountResolverService.resolvePaymentAccount throws exactly this shape.
        throw new BadRequestException('Payment account pa-1 not found for branch b1');
      }),
    };
    const step = new ResolveAccountsStep(accountResolver as any);
    const c = ctx({
      input: {
        invoiceId: 'inv-1',
        payments: [
          { paymentMethod: InvoicePaymentMethod.CASH, amount: 100, paymentAccountId: 'pa-1' },
        ],
      },
    });

    const err = await step.execute(c).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({
      code: 'PAYMENT_ACCOUNT_INVALID',
      message: 'Payment account pa-1 not found for branch b1',
    });
  });

  it('caches account resolution per unique key so it does not call twice for the same payment account', async () => {
    const accountResolver = {
      resolveDefaultAccount: jest.fn(async () => 'acct-revenue'),
      resolvePaymentAccount: jest.fn(async () => ({ accountId: 'acct-cash' })),
    };
    const step = new ResolveAccountsStep(accountResolver as any);
    await step.execute(
      ctx({
        input: {
          invoiceId: 'inv-1',
          payments: [
            { paymentMethod: InvoicePaymentMethod.CASH, amount: 50 },
            { paymentMethod: InvoicePaymentMethod.CASH, amount: 50 },
          ],
        },
      }),
    );
    expect(accountResolver.resolvePaymentAccount).toHaveBeenCalledTimes(1);
  });
});

describe('ResolveFundsStep — fixes bug (e): resolveBranchCashFund used to run after commit', () => {
  it('resolves the branch cash fund only when there is a CASH payment line', async () => {
    const cashFundResolver = { resolveBranchCashFund: jest.fn(async () => 'fund-1') };
    const documentNumbering = { preview: jest.fn(async () => 'HD202608-000001') };
    const voucherService = { validate: jest.fn() };
    const step = new ResolveFundsStep(cashFundResolver as any, documentNumbering as any, voucherService as any);

    const cashCtx = ctx({
      invoice: { branchId: 'b1' } as any,
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100 }],
      },
    });
    await step.execute(cashCtx);
    expect(cashFundResolver.resolveBranchCashFund).toHaveBeenCalledWith('o1', 'b1');
    expect(cashCtx.funds!.cashAccountId).toBe('fund-1');

    cashFundResolver.resolveBranchCashFund.mockClear();
    const bankCtx = ctx({
      invoice: { branchId: 'b1' } as any,
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.BANK_TRANSFER, amount: 100 }],
      },
    });
    await step.execute(bankCtx);
    expect(cashFundResolver.resolveBranchCashFund).not.toHaveBeenCalled();
    expect(bankCtx.funds!.cashAccountId).toBeUndefined();
  });

  it('wraps a plain-string cash-fund failure as CASH_FUND_NOT_CONFIGURED, before any transaction opens (A-22)', async () => {
    const cashFundResolver = {
      resolveBranchCashFund: jest.fn(async () => {
        // Real CashFundResolverService.resolveBranchCashFund throws exactly this shape.
        throw new BadRequestException('No cash fund configured for branch b1');
      }),
    };
    const documentNumbering = { preview: jest.fn(async () => 'HD202608-000001') };
    const voucherService = { validate: jest.fn() };
    const step = new ResolveFundsStep(cashFundResolver as any, documentNumbering as any, voucherService as any);
    const c = ctx({
      invoice: { branchId: 'b1' } as any,
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100 }],
      },
    });

    const err = await step.execute(c).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({
      code: 'CASH_FUND_NOT_CONFIGURED',
      message: 'No cash fund configured for branch b1',
    });
  });

  it('converts a NotFoundException (404) from preview() into a 400 DOC_NUMBER_RULE_MISSING (A-22)', async () => {
    const cashFundResolver = { resolveBranchCashFund: jest.fn() };
    const documentNumbering = {
      preview: jest.fn(async () => {
        // Real DocumentNumberingService.preview throws exactly this shape (404, not 400).
        throw new NotFoundException(
          'No active document numbering rule found for invoice. Please configure one before proceeding.',
        );
      }),
    };
    const voucherService = { validate: jest.fn() };
    const step = new ResolveFundsStep(cashFundResolver as any, documentNumbering as any, voucherService as any);
    const c = ctx({ invoice: { branchId: 'b1' } as any, input: { invoiceId: 'inv-1', payments: [] } });

    const err = await step.execute(c).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toMatchObject({ code: 'DOC_NUMBER_RULE_MISSING' });
  });

  it('does not validate a voucher when the request carries no voucherCode', async () => {
    const cashFundResolver = { resolveBranchCashFund: jest.fn() };
    const documentNumbering = { preview: jest.fn(async () => 'HD202608-000001') };
    const voucherService = { validate: jest.fn() };
    const step = new ResolveFundsStep(cashFundResolver as any, documentNumbering as any, voucherService as any);
    const c = ctx({ invoice: { branchId: 'b1' } as any, input: { invoiceId: 'inv-1', payments: [] } });

    await step.execute(c);
    expect(voucherService.validate).not.toHaveBeenCalled();
    expect(c.voucherId).toBeUndefined();
  });

  it('validates the voucher and folds its discount (capped at subtotal) into invoice.discountAmount (T-05-01)', async () => {
    const cashFundResolver = { resolveBranchCashFund: jest.fn() };
    const documentNumbering = { preview: jest.fn(async () => 'HD202608-000001') };
    const voucherService = {
      validate: jest.fn(async () => ({ id: 'voucher-1', faceValue: 50000 })),
    };
    const step = new ResolveFundsStep(cashFundResolver as any, documentNumbering as any, voucherService as any);
    const invoice = { branchId: 'b1', customerId: 'cust-1', subtotal: 200000, discountAmount: 20000 } as any;
    const c = ctx({
      invoice,
      input: { invoiceId: 'inv-1', payments: [], voucherCode: 'VC-1' },
    });

    await step.execute(c);
    expect(voucherService.validate).toHaveBeenCalledWith('VC-1', 'cust-1', c.actor);
    expect(c.voucherId).toBe('voucher-1');
    expect(invoice.discountAmount).toBe(70000); // 20000 manual + 50000 voucher
  });

  it('caps the voucher discount at the invoice subtotal, same as PromotionApplyService.apply', async () => {
    const cashFundResolver = { resolveBranchCashFund: jest.fn() };
    const documentNumbering = { preview: jest.fn(async () => 'HD202608-000001') };
    const voucherService = {
      validate: jest.fn(async () => ({ id: 'voucher-1', faceValue: 500000 })), // exceeds subtotal
    };
    const step = new ResolveFundsStep(cashFundResolver as any, documentNumbering as any, voucherService as any);
    const invoice = { branchId: 'b1', customerId: 'cust-1', subtotal: 200000, discountAmount: 0 } as any;
    const c = ctx({ invoice, input: { invoiceId: 'inv-1', payments: [], voucherCode: 'VC-1' } });

    await step.execute(c);
    expect(invoice.discountAmount).toBe(200000); // capped, not 500000
  });

  it('wraps a voucher validation failure (any BadRequestException state, or NotFoundException) as VOUCHER_INVALID', async () => {
    const cashFundResolver = { resolveBranchCashFund: jest.fn() };
    const documentNumbering = { preview: jest.fn(async () => 'HD202608-000001') };

    const usedVoucherService = {
      validate: jest.fn(async () => {
        throw new BadRequestException('Voucher "VC-1" has already been used');
      }),
    };
    const step1 = new ResolveFundsStep(cashFundResolver as any, documentNumbering as any, usedVoucherService as any);
    const c1 = ctx({
      invoice: { branchId: 'b1', subtotal: 100000 } as any,
      input: { invoiceId: 'inv-1', payments: [], voucherCode: 'VC-1' },
    });
    const err1 = await step1.execute(c1).catch((e) => e);
    expect(err1.getResponse()).toMatchObject({
      code: 'VOUCHER_INVALID',
      message: 'Voucher "VC-1" has already been used',
    });

    const notFoundVoucherService = {
      validate: jest.fn(async () => {
        throw new NotFoundException('Voucher "VC-1" not found');
      }),
    };
    const step2 = new ResolveFundsStep(cashFundResolver as any, documentNumbering as any, notFoundVoucherService as any);
    const c2 = ctx({
      invoice: { branchId: 'b1', subtotal: 100000 } as any,
      input: { invoiceId: 'inv-1', payments: [], voucherCode: 'VC-1' },
    });
    const err2 = await step2.execute(c2).catch((e) => e);
    expect(err2).toBeInstanceOf(BadRequestException);
    expect(err2.getResponse()).toMatchObject({ code: 'VOUCHER_INVALID' });
  });
});

describe('ComputeTotalsStep', () => {
  const step = new ComputeTotalsStep();

  function withDraft(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
    return ctx({
      invoice: {
        discountAmount: 0,
        pointsDiscountAmount: 0,
        depositAmount: 0,
        customerId: undefined,
      } as any,
      items: [{ lineTotal: 685000 }, { lineTotal: 100000 }] as any,
      ...overrides,
    });
  }

  it('throws a plain (non-HTTP) error when load-draft has not run', async () => {
    await expect(step.execute(ctx())).rejects.toThrow(
      'compute-totals ran before load-draft populated the context',
    );
  });

  it('computes amountDue via the shared computeAmountDue helper, not a reimplemented formula', async () => {
    const c = withDraft({
      invoice: {
        discountAmount: 50000,
        pointsDiscountAmount: 10000,
        depositAmount: 0,
        customerId: undefined,
      } as any,
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 725000 }],
      },
    });
    await step.execute(c);

    const expected = computeAmountDue({
      subtotal: 785000,
      discountAmount: 50000,
      pointsDiscountAmount: 10000,
      depositAmount: 0,
    });
    expect(c.totals!.amountDue).toBe(expected);
    expect(c.totals!.amountDue).toBe(725000);
    expect(c.totals!.pointsEarned).toBe(Math.floor(725000 / POINT_EARN_VND_PER_POINT));
    expect(c.totals!.newStatus).toBe(InvoiceStatus.PAID);
  });

  it('adds the promotion discount from evaluate-promotion on top of the manual discount', async () => {
    const c = withDraft({
      invoice: { discountAmount: 20000, pointsDiscountAmount: 0, depositAmount: 0, customerId: undefined } as any,
      promotion: { promotionDiscount: 30000, appliedPrograms: [], lineDiscounts: [] },
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 735000 }] },
    });
    await step.execute(c);
    expect(c.totals!.amountDue).toBe(735000); // 785000 - 20000 - 30000
  });

  it('pointsEarned drops accordingly once a promotion discount lowers amountDue (T-04-06)', async () => {
    const withoutPromo = withDraft({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: undefined } as any,
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 785000 }] },
    });
    await step.execute(withoutPromo);

    const withPromo = withDraft({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: undefined } as any,
      promotion: { promotionDiscount: 285000, appliedPrograms: [], lineDiscounts: [] },
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 500000 }] },
    });
    await step.execute(withPromo);

    expect(withPromo.totals!.pointsEarned).toBeLessThan(withoutPromo.totals!.pointsEarned);
    expect(withPromo.totals!.pointsEarned).toBe(Math.floor(500000 / POINT_EARN_VND_PER_POINT));
  });

  it('defaults promotionDiscount to 0 when no evaluate-promotion step has run', async () => {
    const c = withDraft({
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 785000 }] },
    });
    await step.execute(c);
    expect(c.totals!.promotionDiscount).toBe(0);
  });

  it('accepts a line whose manual + promotion discount together do not exceed its gross amount (T-04-06)', async () => {
    // gross 200000 (qty 2 × 100000); manual lineDiscount 15000 already nets
    // into lineTotal (185000, the v1 way — computed at draft time); the
    // promotion engine's own 15000 for the same line is a *separate* pool
    // that only shows up in ctx.promotion.promotionDiscount, so amountDue is
    // 185000 - 15000 = 170000. Total per-line discount is 15000+15000=30000,
    // well under the 200000 gross.
    const c = withDraft({
      items: [
        { id: 'line-1', quantity: 2, unitPrice: 100000, lineTotal: 185000, lineDiscount: 15000 } as any,
      ],
      promotion: {
        promotionDiscount: 15000,
        appliedPrograms: [],
        lineDiscounts: [{ lineId: 'line-1', discountAmount: 15000, unitPriceAfter: 85000 }],
      },
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 170000 }] },
    });
    await expect(step.execute(c)).resolves.toBeUndefined();
  });

  it("throws a plain Error when a line's manual + promotion discount together exceed its gross amount (T-04-06)", async () => {
    const c = withDraft({
      items: [
        { id: 'line-1', quantity: 1, unitPrice: 100000, lineTotal: 100000, lineDiscount: 60000 } as any,
      ],
      promotion: {
        promotionDiscount: 50000,
        appliedPrograms: [],
        lineDiscounts: [{ lineId: 'line-1', discountAmount: 50000, unitPriceAfter: 0 }],
      },
    });
    await expect(step.execute(c)).rejects.toThrow(
      'Line line-1 total discount (110000) exceeds its gross amount (100000)',
    );
  });

  // "Khách không lấy tiền thừa" — v1 parity (checkout-invoice.service.ts:174-188).
  it('keeps the surplus out of totalPaid and reports it as keptChange', async () => {
    const c = withDraft({
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 785000 }],
        keptChangeAmount: 15000,
      },
    });
    await step.execute(c);
    expect(c.totals!.keptChange).toBe(15000);
    expect(c.totals!.totalPaid).toBe(785000);
    expect(c.totals!.amountDue).toBe(785000);
  });

  it('defaults keptChange to 0 when the client sends none', async () => {
    const c = withDraft({
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 785000 }] },
    });
    await step.execute(c);
    expect(c.totals!.keptChange).toBe(0);
  });

  it('rejects kept change on an invoice that is not fully settled', async () => {
    const c = withDraft({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: 'cus-1' } as any,
      accounts: { revenueAccountId: 'rev-1', receivableAccountId: 'ar-1', perPayment: [] },
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100000 }],
        keptChangeAmount: 5000,
      },
    });
    await expect(step.execute(c)).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID' },
    });
  });

  it('rejects kept change when no cash line was tendered', async () => {
    const c = withDraft({
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.BANK_TRANSFER, amount: 785000 }],
        keptChangeAmount: 15000,
      },
    });
    await expect(step.execute(c)).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID' },
    });
  });

  it('AC-04-adjacent: rejects overpayment with PAYMENT_INVALID', async () => {
    const c = withDraft({
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 999999 }] },
    });
    await expect(step.execute(c)).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID' },
    });
  });

  it('rejects a remaining debt balance with no customer on the invoice', async () => {
    const c = withDraft({
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100000 }] },
    });
    await expect(step.execute(c)).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID' },
    });
  });

  it('derives PARTIAL_DEBT and DEBT correctly when a customer and a resolved RECEIVABLE are present', async () => {
    const receivableResolved = {
      revenueAccountId: 'acct-revenue',
      receivableAccountId: 'acct-ar',
      perPayment: [],
    };
    const partial = withDraft({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: 'cust-1' } as any,
      accounts: receivableResolved,
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100000 }] },
    });
    await step.execute(partial);
    expect(partial.totals!.newStatus).toBe(InvoiceStatus.PARTIAL_DEBT);

    const full = withDraft({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: 'cust-1' } as any,
      accounts: receivableResolved,
      input: { invoiceId: 'inv-1', payments: [] },
    });
    await step.execute(full);
    expect(full.totals!.newStatus).toBe(InvoiceStatus.DEBT);
  });

  it('requires RECEIVABLE only once an actual remainder exists (deferred from resolve-accounts)', async () => {
    const c = withDraft({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: 'cust-1' } as any,
      accounts: { revenueAccountId: 'acct-revenue', receivableAccountId: undefined, perPayment: [] },
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100000 }] },
    });
    await expect(step.execute(c)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_NOT_CONFIGURED' },
    });
  });

  it('does not require RECEIVABLE when the invoice is paid in full', async () => {
    const c = withDraft({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: undefined } as any,
      accounts: { revenueAccountId: 'acct-revenue', receivableAccountId: undefined, perPayment: [] },
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 785000 }] },
    });
    await step.execute(c);
    expect(c.totals!.newStatus).toBe(InvoiceStatus.PAID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Parity with the v1 fixture — the cheapest and most valuable check of this
// slice (see T-01-09's implementation notes). Mirrors invoiceStub /
// invoiceItemStub / cashPaymentDto in checkout-invoice.service.spec.ts:
// one item, quantity 2 × unitPrice 100 = subtotal 200, discountAmount 0,
// depositAmount 0, customerId 'cust-1'.
// ═══════════════════════════════════════════════════════════════════════════
describe('ComputeTotalsStep — parity with the v1 fixture', () => {
  const step = new ComputeTotalsStep();

  it('full cash payment (200/200): PAID, no debt — same as v1 on this fixture', async () => {
    const c = ctx({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: 'cust-1' } as any,
      items: [{ lineTotal: 200 }] as any,
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 200 }] },
    });
    await step.execute(c);

    expect(c.totals!.subtotal).toBe(200);
    expect(c.totals!.amountDue).toBe(200);
    expect(c.totals!.remainder).toBe(0);
    expect(c.totals!.newStatus).toBe(InvoiceStatus.PAID);
  });

  it('partial cash payment (100/200): PARTIAL_DEBT, remainder 100 — same as v1 on this fixture', async () => {
    const c = ctx({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: 'cust-1' } as any,
      items: [{ lineTotal: 200 }] as any,
      accounts: { revenueAccountId: 'acct-revenue', receivableAccountId: 'acct-ar', perPayment: [] },
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100 }] },
    });
    await step.execute(c);

    expect(c.totals!.amountDue).toBe(200);
    expect(c.totals!.remainder).toBe(100);
    expect(c.totals!.newStatus).toBe(InvoiceStatus.PARTIAL_DEBT);
  });

  it('overpayment (999/200) rejected — same as v1 on this fixture', async () => {
    const c = ctx({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: 'cust-1' } as any,
      items: [{ lineTotal: 200 }] as any,
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 999 }] },
    });
    await expect(step.execute(c)).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID' },
    });
  });

  it('remainder with no customer rejected — same as v1 on this fixture', async () => {
    const c = ctx({
      invoice: { discountAmount: 0, pointsDiscountAmount: 0, depositAmount: 0, customerId: undefined } as any,
      items: [{ lineTotal: 200 }] as any,
      input: { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 100 }] },
    });
    await expect(step.execute(c)).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID' },
    });
  });
});
