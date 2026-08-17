import { BadRequestException } from '@nestjs/common';
import { CheckoutSagaFailureRecorder } from './checkout-saga-failure-recorder';
import { CheckoutSagaEntity, CheckoutSagaStatus } from './checkout-saga.entity';
import { CheckoutContext, CheckoutTrace } from '../application/checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    sagaId: 'saga-1',
    ...overrides,
  };
}

function traceWith(...names: string[]): CheckoutTrace {
  const trace = new CheckoutTrace();
  names.forEach((name, i) =>
    trace.record({
      seq: i + 1,
      name,
      phase: 'transactional',
      status: i === names.length - 1 ? 'FAILED' : 'OK',
      startedAt: new Date(),
      durationMs: 5,
      error: i === names.length - 1 ? 'ACCOUNT_NOT_CONFIGURED' : undefined,
    }),
  );
  return trace;
}

describe('CheckoutSagaFailureRecorder', () => {
  const sagaRepo = { findOne: jest.fn(), create: jest.fn((x) => x), save: jest.fn((x) => x) };
  const stepRepo = { delete: jest.fn(), create: jest.fn((x) => x), save: jest.fn((rows) => rows) };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === CheckoutSagaEntity ? sagaRepo : stepRepo,
    ),
  } as any;
  const dataSource = {
    transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) => cb(manager)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sagaRepo.create.mockImplementation((x) => x);
    sagaRepo.save.mockImplementation((x) => x);
    stepRepo.create.mockImplementation((x) => x);
    stepRepo.save.mockImplementation((rows) => rows);
  });

  it('creates a fresh saga row (FAILED) when none exists yet, using ctx.sagaId as its id', async () => {
    sagaRepo.findOne.mockResolvedValue(null);
    const recorder = new CheckoutSagaFailureRecorder(dataSource as any);
    const trace = traceWith('load-draft', 'resolve-accounts');
    const error = new BadRequestException({ code: 'ACCOUNT_NOT_CONFIGURED' });

    await recorder.record(ctx(), trace, error);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(sagaRepo.findOne).toHaveBeenCalledWith({ where: { id: 'saga-1' } });
    expect(sagaRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'saga-1',
        organizationId: 'o1',
        branchId: 'b1',
        createdBy: 'u1',
        idempotencyKey: 'inv-1',
      }),
    );
    const saved = sagaRepo.save.mock.calls[0][0];
    expect(saved.status).toBe(CheckoutSagaStatus.FAILED);
    expect(saved.currentStep).toBe('resolve-accounts');
    expect(saved.totalSteps).toBe(2);
    expect(saved.error).toMatchObject({ step: 'resolve-accounts' });
  });

  it('generates a fresh id when ctx.sagaId is undefined (the run failed before open-saga ran)', async () => {
    sagaRepo.findOne.mockResolvedValue(null);
    const recorder = new CheckoutSagaFailureRecorder(dataSource as any);

    await recorder.record(ctx({ sagaId: undefined }), traceWith('load-draft'), new Error('boom'));

    expect(sagaRepo.findOne).not.toHaveBeenCalledWith({ where: { id: 'saga-1' } });
    const created = sagaRepo.create.mock.calls[0][0];
    expect(typeof created.id).toBe('string');
    expect(created.id.length).toBeGreaterThan(0);
  });

  it('reuses an existing row instead of creating a duplicate when one is found for the id', async () => {
    const existing = { id: 'saga-1', idempotencyKey: 'inv-1' };
    sagaRepo.findOne.mockResolvedValue(existing);
    const recorder = new CheckoutSagaFailureRecorder(dataSource as any);

    await recorder.record(ctx(), traceWith('load-draft'), new Error('boom'));

    expect(sagaRepo.create).not.toHaveBeenCalled();
    expect(sagaRepo.save).toHaveBeenCalledWith(existing);
  });

  it('deletes any prior step rows and re-persists the full trail from memory, not from the DB', async () => {
    sagaRepo.findOne.mockResolvedValue(null);
    const recorder = new CheckoutSagaFailureRecorder(dataSource as any);
    const trace = traceWith('load-draft', 'resolve-accounts', 'compute-totals');

    await recorder.record(ctx(), trace, new Error('boom'));

    expect(stepRepo.delete).toHaveBeenCalledWith({ sagaId: 'saga-1' });
    const savedRows = stepRepo.save.mock.calls[0][0];
    expect(savedRows).toHaveLength(3);
    expect(savedRows.map((r: { name: string }) => r.name)).toEqual([
      'load-draft',
      'resolve-accounts',
      'compute-totals',
    ]);
    expect(savedRows[2].status).toBe('FAILED');
  });
});
