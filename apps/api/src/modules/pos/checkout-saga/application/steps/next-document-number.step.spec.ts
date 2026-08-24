import { BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { NextDocumentNumberStep } from './next-document-number.step';
import { DocumentNumberRuleEntity, ResetPolicy } from '../../../../document-numbering/document-number-rule.entity';
import { DocumentNumberCounterEntity } from '../../../../document-numbering/document-number-counter.entity';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', branchId: 'b1' } as any,
    ...overrides,
  };
}

function withManager(opts: {
  rule?: Partial<DocumentNumberRuleEntity> | null;
  branchRule?: Partial<DocumentNumberRuleEntity> | null;
  existingCounter?: Partial<DocumentNumberCounterEntity> | null;
  saveCounter?: jest.Mock;
}) {
  const ruleFindOne = jest
    .fn()
    .mockResolvedValueOnce(opts.branchRule ?? null) // branch-scoped lookup first
    .mockResolvedValueOnce(opts.rule ?? null); // org-wide fallback
  const ruleRepo = { findOne: ruleFindOne };

  const counterRepo = {
    create: jest.fn((x: unknown) => x),
    save: opts.saveCounter ?? jest.fn((x: unknown) => x),
  };
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(opts.existingCounter ?? null),
  };

  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === DocumentNumberRuleEntity ? ruleRepo : counterRepo,
    ),
    createQueryBuilder: jest.fn(() => qb),
  } as any;

  return { manager, ruleFindOne, counterRepo, qb };
}

describe('NextDocumentNumberStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    await expect(new NextDocumentNumberStep().execute(ctx())).rejects.toThrow(
      'next-document-number ran outside a transaction',
    );
  });

  it('throws a plain Error when load-draft has not populated ctx.invoice', async () => {
    const { manager } = withManager({});
    await expect(
      new NextDocumentNumberStep().execute(ctx({ invoice: undefined, manager })),
    ).rejects.toThrow('next-document-number ran before load-draft populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const { manager, ruleFindOne } = withManager({});
    await new NextDocumentNumberStep().execute(ctx({ replayed: true, manager }));
    expect(ruleFindOne).not.toHaveBeenCalled();
  });

  it('rejects with 400 DOC_NUMBER_RULE_MISSING when no active rule exists', async () => {
    const { manager } = withManager({ rule: null, branchRule: null });
    await expect(new NextDocumentNumberStep().execute(ctx({ manager }))).rejects.toMatchObject({
      response: { code: 'DOC_NUMBER_RULE_MISSING' },
    });
  });

  it('prefers a branch-scoped rule over the org-wide default', async () => {
    const { manager, ruleFindOne, qb } = withManager({
      branchRule: {
        id: 'rule-branch',
        prefix: 'INV',
        includeDate: true,
        dateFormat: 'YYYYMM',
        sequenceLength: 5,
        separator: '-',
        resetPolicy: ResetPolicy.MONTHLY,
      },
      existingCounter: { currentValue: 3 },
    });

    const c = ctx({ manager });
    await new NextDocumentNumberStep().execute(c);

    // Only the branch-scoped lookup should have been consulted (org-wide never called).
    expect(ruleFindOne).toHaveBeenCalledTimes(1);
    expect(qb.where).toHaveBeenCalledWith('counter.ruleId = :ruleId', { ruleId: 'rule-branch' });
    expect(c.documentNumber).toMatch(/^INV-\d{6}-00004$/);
  });

  it('locks and increments an existing counter, formatting the result', async () => {
    const { manager } = withManager({
      rule: {
        id: 'rule-1',
        prefix: 'INV',
        includeDate: true,
        dateFormat: 'YYYYMM',
        sequenceLength: 5,
        separator: '-',
        resetPolicy: ResetPolicy.MONTHLY,
      },
      existingCounter: { currentValue: 41 },
    });

    const c = ctx({ manager });
    await new NextDocumentNumberStep().execute(c);

    expect(c.documentNumber).toMatch(/^INV-\d{6}-00042$/);
  });

  it('creates a fresh counter at 1 when none exists yet for the resetKey', async () => {
    const saveCounter = jest.fn((x: unknown) => x);
    const { manager, counterRepo } = withManager({
      rule: {
        id: 'rule-1',
        prefix: 'NV',
        includeDate: false,
        sequenceLength: 6,
        resetPolicy: ResetPolicy.NEVER,
      },
      existingCounter: null,
      saveCounter,
    });

    const c = ctx({ manager });
    await new NextDocumentNumberStep().execute(c);

    expect(counterRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule-1', resetKey: 'NEVER', currentValue: 1 }),
    );
    expect(c.documentNumber).toBe('NV000001');
  });

  it('turns a unique-violation on the first counter insert into 400 DOC_NUMBER_COUNTER_CONFLICT, not a retry inside the same transaction', async () => {
    const unique = Object.assign(
      new QueryFailedError('INSERT ...', [], new Error('duplicate key') as any),
      { code: '23505' },
    );
    const { manager } = withManager({
      rule: {
        id: 'rule-1',
        prefix: 'INV',
        includeDate: true,
        dateFormat: 'YYYYMM',
        sequenceLength: 5,
        separator: '-',
        resetPolicy: ResetPolicy.MONTHLY,
      },
      existingCounter: null,
      saveCounter: jest.fn().mockRejectedValue(unique),
    });

    const err = await new NextDocumentNumberStep().execute(ctx({ manager })).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'DOC_NUMBER_COUNTER_CONFLICT' });
  });

  it('rethrows a counter-save failure unrelated to the unique constraint unchanged', async () => {
    const boom = new Error('connection reset');
    const { manager } = withManager({
      rule: { id: 'rule-1', prefix: 'INV', includeDate: false, sequenceLength: 5, resetPolicy: ResetPolicy.NEVER },
      existingCounter: null,
      saveCounter: jest.fn().mockRejectedValue(boom),
    });

    await expect(new NextDocumentNumberStep().execute(ctx({ manager }))).rejects.toBe(boom);
  });
});

// T-01-05 — the sale-side number over time and across branches. The step is the
// only path a SALE takes (ADR-05), so proving it on the service side proves
// nothing about this.
describe('NextDocumentNumberStep — the YYMMDD sequence (AC-02, AC-03, AC-07)', () => {
  const invoiceRule: Partial<DocumentNumberRuleEntity> = {
    id: 'rule-invoice',
    prefix: '',
    includeDate: true,
    dateFormat: 'YYMMDD',
    sequenceLength: 4,
    separator: '',
    resetPolicy: ResetPolicy.DAILY,
  };

  afterEach(() => jest.useRealTimers());

  const at = (iso: string) => jest.useFakeTimers().setSystemTime(new Date(iso));

  it('the first sale of the day is 0001', async () => {
    at('2026-08-21T09:00:00.000+07:00');
    const { manager } = withManager({ rule: invoiceRule, existingCounter: null });

    const c = ctx({ manager });
    await new NextDocumentNumberStep().execute(c);

    expect(c.documentNumber).toBe('2608210001');
  });

  it('the next sale the same day increments (AC-02)', async () => {
    at('2026-08-21T17:09:00.000+07:00');
    const { manager } = withManager({
      rule: invoiceRule,
      existingCounter: { currentValue: 1 },
    });

    const c = ctx({ manager });
    await new NextDocumentNumberStep().execute(c);

    expect(c.documentNumber).toBe('2608210002');
  });

  it('a new day asks for a new counter period and starts over at 0001 (AC-03)', async () => {
    at('2026-08-21T23:59:00.000+07:00');
    const day1 = withManager({ rule: invoiceRule, existingCounter: { currentValue: 6 } });
    const c1 = ctx({ manager: day1.manager });
    await new NextDocumentNumberStep().execute(c1);
    expect(c1.documentNumber).toBe('2608210007');
    expect(day1.qb.andWhere).toHaveBeenCalledWith('counter.resetKey = :resetKey', {
      resetKey: '2026-08-21',
    });

    // Next day: DAILY means a different resetKey, so the lookup misses and the
    // fresh counter starts at 1 — not 8.
    at('2026-08-22T08:00:00.000+07:00');
    const day2 = withManager({ rule: invoiceRule, existingCounter: null });
    const c2 = ctx({ manager: day2.manager });
    await new NextDocumentNumberStep().execute(c2);
    expect(c2.documentNumber).toBe('2608220001');
    expect(day2.qb.andWhere).toHaveBeenCalledWith('counter.resetKey = :resetKey', {
      resetKey: '2026-08-22',
    });
  });

  it('each branch mints from its own already-resolved rule, independent of the other branch (AC-07)', async () => {
    at('2026-08-21T10:00:00.000+07:00');

    // A-10/ADR-07: DocumentNumberingService.preview()/generate() has already
    // cloned a branch-scoped rule for each branch before this step ever runs
    // (this step / mint-document-number.ts does not create rules — it only
    // resolves the already-existing branch rule, unchanged by ADR-07). Each
    // branch therefore resolves a DISTINCT rule id on its very first lookup —
    // the org-wide fallback is never consulted.
    const branchARule = { ...invoiceRule, id: 'rule-branch-a' };
    const branchBRule = { ...invoiceRule, id: 'rule-branch-b' };

    // Branch A: nothing issued yet today on its own rule.
    const a = withManager({ branchRule: branchARule, existingCounter: null });
    const ca = ctx({ manager: a.manager, invoice: { id: 'inv-a', branchId: 'branch-a' } as any });
    await new NextDocumentNumberStep().execute(ca);

    // Branch B, same organisation: its own rule, its own counter — nothing
    // issued yet today either, so it also dials from 0001.
    const b = withManager({ branchRule: branchBRule, existingCounter: null });
    const cb = ctx({ manager: b.manager, invoice: { id: 'inv-b', branchId: 'branch-b' } as any });
    await new NextDocumentNumberStep().execute(cb);

    expect(ca.documentNumber).toBe('2608210001');
    expect(cb.documentNumber).toBe('2608210001');

    // Each branch's counter lock used its OWN rule id, not a shared org-wide
    // one — that is what keeps the two independent dials apart.
    expect(a.ruleFindOne).toHaveBeenCalledTimes(1);
    expect(a.qb.where).toHaveBeenCalledWith('counter.ruleId = :ruleId', {
      ruleId: 'rule-branch-a',
    });
    expect(b.ruleFindOne).toHaveBeenCalledTimes(1);
    expect(b.qb.where).toHaveBeenCalledWith('counter.ruleId = :ruleId', {
      ruleId: 'rule-branch-b',
    });
  });
});
