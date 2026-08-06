import { CloseSagaStep } from './close-saga.step';
import { CheckoutSagaEntity, CheckoutSagaStatus } from '../../infrastructure/checkout-saga.entity';
import { CheckoutContext, CheckoutTrace } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    sagaId: 'saga-1',
    invoice: { id: 'inv-1' } as any,
    documentNumber: 'HD202608-00001',
    ...overrides,
  };
}

function withManager(sagaRepo: any, stepRepo: any) {
  return {
    getRepository: jest.fn((entity: unknown) =>
      entity === CheckoutSagaEntity ? sagaRepo : stepRepo,
    ),
  } as any;
}

function traceWith(...names: string[]): CheckoutTrace {
  const trace = new CheckoutTrace();
  names.forEach((name, i) =>
    trace.record({
      seq: i + 1,
      name,
      phase: i === 0 ? 'preflight' : 'transactional',
      status: 'OK',
      startedAt: new Date(),
      durationMs: 5,
    }),
  );
  return trace;
}

describe('CloseSagaStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    await expect(new CloseSagaStep().execute(ctx())).rejects.toThrow(
      'close-saga ran outside a transaction',
    );
  });

  it('throws a plain Error when sagaId/trace are missing', async () => {
    const manager = withManager({}, {});
    await expect(
      new CloseSagaStep().execute(ctx({ manager, sagaId: undefined })),
    ).rejects.toThrow('close-saga ran before open-saga populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const sagaRepo = { findOneOrFail: jest.fn() };
    await new CloseSagaStep().execute(
      ctx({ replayed: true, manager: withManager(sagaRepo, {}), trace: new CheckoutTrace() }),
    );
    expect(sagaRepo.findOneOrFail).not.toHaveBeenCalled();
  });

  it('marks the saga COMPLETED and flushes every prior step plus its own row', async () => {
    const saga: any = { id: 'saga-1' };
    const sagaRepo = {
      findOneOrFail: jest.fn().mockResolvedValue(saga),
      save: jest.fn((x: unknown) => x),
    };
    const stepRepo = { create: jest.fn((x: unknown) => x), save: jest.fn((rows: unknown) => rows) };
    const trace = traceWith('load-draft', 'open-saga', 'lock-invoice');
    const c = ctx({ manager: withManager(sagaRepo, stepRepo), trace });

    await new CloseSagaStep().execute(c);

    expect(saga.status).toBe(CheckoutSagaStatus.COMPLETED);
    expect(saga.invoiceId).toBe('inv-1');
    expect(saga.documentNumber).toBe('HD202608-00001');
    expect(saga.totalSteps).toBe(4); // 3 already in trace + itself
    expect(saga.finishedAt).toBeInstanceOf(Date);
    expect(sagaRepo.save).toHaveBeenCalledWith(saga);

    const savedRows = stepRepo.save.mock.calls[0][0] as Array<{
      name: string;
      seq: number;
      status: string;
    }>;
    expect(savedRows).toHaveLength(4);
    expect(savedRows.map((r) => r.name)).toEqual([
      'load-draft',
      'open-saga',
      'lock-invoice',
      'close-saga',
    ]);
    expect(savedRows[3].seq).toBe(4);
    expect(savedRows[3].status).toBe('OK');
  });
});
