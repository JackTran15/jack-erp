import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OpenSagaStep } from './open-saga.step';
import { CheckoutSagaEntity, CheckoutSagaStatus } from '../../infrastructure/checkout-saga.entity';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1' } as any,
    ...overrides,
  };
}

function withManager(sagaRepo: any, invoiceRepo: any) {
  return {
    getRepository: jest.fn((entity: unknown) =>
      entity === CheckoutSagaEntity ? sagaRepo : invoiceRepo,
    ),
  } as any;
}

describe('OpenSagaStep', () => {
  it('throws a plain Error when run outside a transaction (ctx.manager unset)', async () => {
    const step = new OpenSagaStep();
    await expect(step.execute(ctx())).rejects.toThrow('open-saga ran outside a transaction');
  });

  it('replays a COMPLETED saga: sets replayed, sagaId, documentNumber and looks up the invoice', async () => {
    const sagaRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'saga-old',
        status: CheckoutSagaStatus.COMPLETED,
        documentNumber: 'HD202608-000001',
        invoiceId: 'inv-1',
      }),
    };
    const invoiceRepo = { findOne: jest.fn().mockResolvedValue({ id: 'inv-1', code: 'HD202608-000001' }) };
    const c = ctx({ manager: withManager(sagaRepo, invoiceRepo) });
    const step = new OpenSagaStep();

    await step.execute(c);

    expect(c.replayed).toBe(true);
    expect(c.sagaId).toBe('saga-old');
    expect(c.documentNumber).toBe('HD202608-000001');
    expect(c.invoice).toEqual({ id: 'inv-1', code: 'HD202608-000001' });
  });

  it('replays a COMPLETED saga with no invoiceId without attempting an invoice lookup', async () => {
    const sagaRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'saga-old',
        status: CheckoutSagaStatus.COMPLETED,
        invoiceId: undefined,
      }),
    };
    const invoiceRepo = { findOne: jest.fn() };
    const c = ctx({ manager: withManager(sagaRepo, invoiceRepo) });

    await new OpenSagaStep().execute(c);

    expect(invoiceRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects with 409 CHECKOUT_IN_PROGRESS when an existing saga is still PENDING', async () => {
    const sagaRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'saga-old', status: CheckoutSagaStatus.PENDING }),
    };
    const c = ctx({ manager: withManager(sagaRepo, {}) });

    await expect(new OpenSagaStep().execute(c)).rejects.toMatchObject({
      response: { code: 'CHECKOUT_IN_PROGRESS' },
    });
  });

  it('creates a fresh PENDING saga row and assigns ctx.sagaId when none exists', async () => {
    const sagaRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: unknown) => x),
      save: jest.fn().mockResolvedValue({ id: 'saga-new' }),
    };
    const c = ctx({ manager: withManager(sagaRepo, {}) });

    await new OpenSagaStep().execute(c);

    expect(sagaRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'o1',
        idempotencyKey: 'inv-1',
        status: CheckoutSagaStatus.PENDING,
        invoiceId: 'inv-1',
      }),
    );
    expect(c.sagaId).toBe('saga-new');
  });

  it('turns a unique-violation (23505) on insert into 409 CHECKOUT_IN_PROGRESS — the real race path', async () => {
    const unique = Object.assign(
      new QueryFailedError('INSERT ...', [], new Error('duplicate key') as any),
      { code: '23505' },
    );
    const sagaRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: unknown) => x),
      save: jest.fn().mockRejectedValue(unique),
    };
    const c = ctx({ manager: withManager(sagaRepo, {}) });

    const err = await new OpenSagaStep().execute(c).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'CHECKOUT_IN_PROGRESS' });
  });

  it('rethrows a save failure unrelated to the unique constraint unchanged', async () => {
    const boom = new Error('connection reset');
    const sagaRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: unknown) => x),
      save: jest.fn().mockRejectedValue(boom),
    };
    const c = ctx({ manager: withManager(sagaRepo, {}) });

    await expect(new OpenSagaStep().execute(c)).rejects.toBe(boom);
  });
});
