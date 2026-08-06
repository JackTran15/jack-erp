import { NotFoundException } from '@nestjs/common';
import { CheckoutSagaController } from './checkout-saga.controller';
import { CheckoutSagaOrchestrator } from '../application/checkout-saga.orchestrator';
import { CheckoutContext, CheckoutStep, CheckoutTrace } from '../application/checkout-step';
import { CheckoutSagaStatus } from '../infrastructure/checkout-saga.entity';
import { CheckoutV2Dto } from './dto/checkout-v2.dto';

/**
 * Unit-level spec, calling the controller's methods directly (same convention
 * as checkout-invoice.service.spec.ts — a real service class, mocked
 * collaborators). What each step actually does is covered by that step's own
 * spec, and the orchestrator's own spec covers preflight/transactional
 * sequencing and dryRun short-circuiting — this file only proves the
 * controller wires the right 19 steps, in the right order, into
 * `orchestrator.run`, and shapes the response correctly.
 */

const actor = { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] };

function dto(overrides: Partial<CheckoutV2Dto> = {}): CheckoutV2Dto {
  return {
    invoiceId: 'inv-1',
    payments: [{ paymentMethod: 'cash' as any, amount: 200 }],
    ...overrides,
  };
}

describe('CheckoutSagaController', () => {
  let orchestrator: { run: jest.Mock };
  let sagaRepo: { findOne: jest.Mock };
  let sagaStepRepo: { find: jest.Mock };
  let controller: CheckoutSagaController;
  const steps = {
    loadDraft: {},
    evaluatePromotion: {},
    resolveAccounts: {},
    resolveFunds: {},
    computeTotals: {},
    openSaga: {},
    lockInvoice: {},
    nextDocumentNumber: {},
    redeemVoucher: {},
    persistInvoice: {},
    persistPayments: {},
    createDebt: {},
    redeemPoints: {},
    deductStock: {},
    postJournal: {},
    postCash: {},
    postDeposit: {},
    enqueueOutbox: {},
    closeSaga: {},
  };
  const orderedSteps = [
    steps.loadDraft,
    steps.evaluatePromotion,
    steps.resolveAccounts,
    steps.resolveFunds,
    steps.computeTotals,
    steps.openSaga,
    steps.lockInvoice,
    steps.nextDocumentNumber,
    steps.redeemVoucher,
    steps.persistInvoice,
    steps.persistPayments,
    steps.createDebt,
    steps.redeemPoints,
    steps.deductStock,
    steps.postJournal,
    steps.postCash,
    steps.postDeposit,
    steps.enqueueOutbox,
    steps.closeSaga,
  ];

  beforeEach(() => {
    orchestrator = { run: jest.fn() };
    sagaRepo = { findOne: jest.fn() };
    sagaStepRepo = { find: jest.fn() };
    controller = new CheckoutSagaController(
      orchestrator as unknown as CheckoutSagaOrchestrator,
      steps.loadDraft as any,
      steps.evaluatePromotion as any,
      steps.resolveAccounts as any,
      steps.resolveFunds as any,
      steps.computeTotals as any,
      steps.openSaga as any,
      steps.lockInvoice as any,
      steps.nextDocumentNumber as any,
      steps.redeemVoucher as any,
      steps.persistInvoice as any,
      steps.persistPayments as any,
      steps.createDebt as any,
      steps.redeemPoints as any,
      steps.deductStock as any,
      steps.postJournal as any,
      steps.postCash as any,
      steps.postDeposit as any,
      steps.enqueueOutbox as any,
      steps.closeSaga as any,
      sagaRepo as any,
      sagaStepRepo as any,
    );
  });

  describe('POST /v2/pos/checkout', () => {
    it('runs the 19 registered steps, in registration order, via orchestrator.run', async () => {
      orchestrator.run.mockImplementation(
        async (stepList: CheckoutStep[], ctx: CheckoutContext, trace: CheckoutTrace, totalSteps: number) => {
          expect(stepList).toEqual(orderedSteps);
          expect(totalSteps).toBe(19);
          ctx.invoice = { id: 'inv-1' } as any;
          ctx.sagaId = 'saga-1';
          ctx.documentNumber = 'HD-000001';
          ctx.totals = { amountDue: 200 } as any;
          ctx.promotion = { promotionDiscount: 0, appliedPrograms: [{ programId: 'p1' }], lineDiscounts: [] };
          trace.record({ seq: 1, name: 'load-draft', phase: 'preflight', status: 'OK', startedAt: new Date(), durationMs: 2 });
        },
      );

      const result = await controller.checkout(dto(), undefined, undefined, actor as any);

      expect(result).toEqual({
        committed: true,
        invoiceId: 'inv-1',
        sagaId: 'saga-1',
        documentNumber: 'HD-000001',
        totals: { amountDue: 200 },
        appliedPrograms: [{ programId: 'p1' }],
        steps: [{ seq: 1, name: 'load-draft', phase: 'preflight', status: 'OK', durationMs: 2 }],
      });
    });

    it('sets ctx.dryRun = true only when dryRun is explicitly true, and reports committed:false', async () => {
      let seenCtx!: CheckoutContext;
      orchestrator.run.mockImplementation(async (_s, ctx) => {
        seenCtx = ctx;
      });

      const result = await controller.checkout(dto({ dryRun: true }), undefined, undefined, actor as any);

      expect(seenCtx.dryRun).toBe(true);
      expect(result.committed).toBe(false);
    });

    it('treats dryRun:false the same as absent — dryRun stays false, committed:true', async () => {
      let seenCtx!: CheckoutContext;
      orchestrator.run.mockImplementation(async (_s, ctx) => {
        seenCtx = ctx;
      });

      const result = await controller.checkout(dto({ dryRun: false }), undefined, undefined, actor as any);

      expect(seenCtx.dryRun).toBe(false);
      expect(result.committed).toBe(true);
    });

    it('defaults idempotencyKey to invoiceId when x-idempotency-key is absent (A-13)', async () => {
      let seenCtx!: CheckoutContext;
      orchestrator.run.mockImplementation(async (_s, ctx) => {
        seenCtx = ctx;
      });

      await controller.checkout(dto({ invoiceId: 'inv-42' }), undefined, undefined, actor as any);

      expect(seenCtx.idempotencyKey).toBe('inv-42');
    });

    it('uses the client-supplied x-idempotency-key when present', async () => {
      let seenCtx!: CheckoutContext;
      orchestrator.run.mockImplementation(async (_s, ctx) => {
        seenCtx = ctx;
      });

      await controller.checkout(dto(), 'client-key-1', undefined, actor as any);

      expect(seenCtx.idempotencyKey).toBe('client-key-1');
    });

    it('correlationId falls back to the idempotencyKey when x-request-id is absent', async () => {
      let seenCtx!: CheckoutContext;
      orchestrator.run.mockImplementation(async (_s, ctx) => {
        seenCtx = ctx;
      });

      await controller.checkout(dto({ invoiceId: 'inv-7' }), undefined, undefined, actor as any);

      expect(seenCtx.correlationId).toBe('inv-7');
    });

    it('propagates a run failure unchanged (the orchestrator already shaped it)', async () => {
      const boom = new NotFoundException({ code: 'INVOICE_NOT_FOUND' });
      orchestrator.run.mockRejectedValue(boom);

      await expect(
        controller.checkout(dto(), undefined, undefined, actor as any),
      ).rejects.toBe(boom);
    });
  });

  describe('GET /v2/pos/checkout/sagas/:id', () => {
    it('returns 404 when the saga does not belong to the actor organization', async () => {
      sagaRepo.findOne.mockResolvedValue(null);
      const err = await controller.getSaga('saga-1', actor as any).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.getResponse()).toMatchObject({ code: 'CHECKOUT_SAGA_NOT_FOUND' });
      expect(sagaRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'saga-1', organizationId: 'o1' },
      });
    });

    it('returns the saga with its step trail ordered by seq', async () => {
      const saga = { id: 'saga-1', status: CheckoutSagaStatus.COMPLETED };
      const stepRows = [
        { seq: 1, name: 'load-draft' },
        { seq: 2, name: 'evaluate-promotion' },
      ];
      sagaRepo.findOne.mockResolvedValue(saga);
      sagaStepRepo.find.mockResolvedValue(stepRows);

      const result = await controller.getSaga('saga-1', actor as any);

      expect(result).toEqual({ saga, steps: stepRows });
      expect(sagaStepRepo.find).toHaveBeenCalledWith({
        where: { sagaId: 'saga-1' },
        order: { seq: 'ASC' },
      });
    });
  });
});
