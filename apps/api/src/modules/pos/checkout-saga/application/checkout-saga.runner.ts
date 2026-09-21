import { Injectable } from '@nestjs/common';
import type { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CheckoutSagaOrchestrator } from './checkout-saga.orchestrator';
import {
  CheckoutContext,
  CheckoutInput,
  CheckoutStep,
  CheckoutStepPhase,
  CheckoutStepStatus,
  CheckoutTotals,
  CheckoutTrace,
} from './checkout-step';
import { LoadDraftStep } from './steps/load-draft.step';
import { EvaluatePromotionStep } from './steps/evaluate-promotion.step';
import { ClampPointsStep } from './steps/clamp-points.step';
import { ResolveAccountsStep } from './steps/resolve-accounts.step';
import { ResolveFundsStep } from './steps/resolve-funds.step';
import { ComputeTotalsStep, computeAmounts } from './steps/compute-totals.step';
import { OpenSagaStep } from './steps/open-saga.step';
import { LockInvoiceStep } from './steps/lock-invoice.step';
import { NextDocumentNumberStep } from './steps/next-document-number.step';
import { RedeemVoucherStep } from './steps/redeem-voucher.step';
import { PersistInvoiceStep } from './steps/persist-invoice.step';
import { PersistPaymentsStep } from './steps/persist-payments.step';
import { CreateDebtStep } from './steps/create-debt.step';
import { RedeemPointsStep } from './steps/redeem-points.step';
import { DeductStockStep } from './steps/deduct-stock.step';
import { PostJournalStep } from './steps/post-journal.step';
import { PostCashStep } from './steps/post-cash.step';
import { PostDepositStep } from './steps/post-deposit.step';
import { EnqueueOutboxStep } from './steps/enqueue-outbox.step';
import { CloseSagaStep } from './steps/close-saga.step';

export interface CheckoutRunOptions {
  idempotencyKey: string;
  correlationId: string;
  dryRun?: boolean;
}

/** Exactly what `POST /v2/pos/checkout` has always returned — the web POS reads this shape. */
export interface CheckoutRunResult {
  committed: boolean;
  invoiceId: string | undefined;
  sagaId: string | undefined;
  documentNumber: string | undefined;
  totals: CheckoutTotals | undefined;
  appliedPrograms: unknown[];
  steps: {
    seq: number;
    name: string;
    phase: CheckoutStepPhase;
    status: CheckoutStepStatus;
    durationMs: number;
  }[];
}

export type CheckoutPreviewInput = Pick<
  CheckoutInput,
  'invoiceId' | 'selectedProgramIds' | 'excludedProgramIds'
>;

export interface CheckoutPreview {
  totals: {
    subtotal: number;
    manualDiscountAmount: number;
    promotionDiscount: number;
    /** After clamp-points — the number checkout will actually take off the card. */
    pointsRedeemed: number;
    pointsDiscountAmount: number;
    depositAmount: number;
    amountDue: number;
    /** After the customer/pointsBlocked gates — what persist-invoice will store. */
    pointsEarned: number;
  };
  appliedPrograms: unknown[];
  lineDiscounts: unknown[];
}

/**
 * The one way into the checkout saga, for every caller. Lifted out of
 * `CheckoutSagaController` (T-03-01, ADR-49) so the mobile cashier path can
 * run the very same 20 steps — idempotency, locking, stock, GL, cash — rather
 * than a second, drifting copy of them. The web controller now only reads its
 * headers and delegates here.
 */
@Injectable()
export class CheckoutSagaRunner {
  constructor(
    private readonly orchestrator: CheckoutSagaOrchestrator,
    private readonly loadDraft: LoadDraftStep,
    private readonly evaluatePromotion: EvaluatePromotionStep,
    private readonly resolveAccounts: ResolveAccountsStep,
    private readonly resolveFunds: ResolveFundsStep,
    private readonly clampPoints: ClampPointsStep,
    private readonly computeTotals: ComputeTotalsStep,
    private readonly openSaga: OpenSagaStep,
    private readonly lockInvoice: LockInvoiceStep,
    private readonly nextDocumentNumber: NextDocumentNumberStep,
    private readonly redeemVoucher: RedeemVoucherStep,
    private readonly persistInvoice: PersistInvoiceStep,
    private readonly persistPayments: PersistPaymentsStep,
    private readonly createDebt: CreateDebtStep,
    private readonly redeemPoints: RedeemPointsStep,
    private readonly deductStock: DeductStockStep,
    private readonly postJournal: PostJournalStep,
    private readonly postCash: PostCashStep,
    private readonly postDeposit: PostDepositStep,
    private readonly enqueueOutbox: EnqueueOutboxStep,
    private readonly closeSaga: CloseSagaStep,
  ) {}

  async run(
    input: CheckoutInput,
    opts: CheckoutRunOptions,
    actor: ActorContext,
  ): Promise<CheckoutRunResult> {
    const ctx: CheckoutContext = {
      actor,
      input,
      correlationId: opts.correlationId,
      idempotencyKey: opts.idempotencyKey,
      dryRun: opts.dryRun === true,
    };
    const trace = new CheckoutTrace();
    const steps = this.allSteps();

    await this.orchestrator.run(steps, ctx, trace, steps.length);

    return {
      committed: !ctx.dryRun,
      invoiceId: ctx.invoice?.id,
      sagaId: ctx.sagaId,
      documentNumber: ctx.documentNumber,
      totals: ctx.totals,
      appliedPrograms: ctx.promotion?.appliedPrograms ?? [],
      steps: trace.entries.map((entry) => ({
        seq: entry.seq,
        name: entry.name,
        phase: entry.phase,
        status: entry.status,
        durationMs: entry.durationMs,
      })),
    };
  }

  /**
   * What the sale is worth right now, before anyone has said how it will be
   * paid — for the cashier's "Thu tiền" screen (ADR-51).
   *
   * Not the controller's `dryRun`: that runs `compute-totals`, whose payment
   * guards throw `PAYMENT_INVALID` for `payments = []` on a walk-in customer
   * (remaining debt with no customer). Preview runs only the three steps the
   * numbers depend on, then the same pure `computeAmounts` that
   * `compute-totals` itself calls, so the two can never disagree.
   *
   * Deliberately left out:
   * - `resolve-accounts` — only feeds the RECEIVABLE guard and posting, never
   *   an amount.
   * - `resolve-funds` — its only effect on the numbers is folding a voucher
   *   into `discountAmount` (which `clamp-points` then reads), and a preview
   *   carries no voucher. It also calls `DocumentNumberingService.preview`,
   *   which self-provisions a numbering rule — a write preview must not make.
   *   If preview ever accepts a voucher, fold it here explicitly rather than
   *   pulling that step in.
   *
   * Runs through `orchestrator.runPreflight` (never `run`) so a failure has
   * the same `{ code, failedStep }` shape checkout gives, and no transaction
   * is ever opened. Every step here only reads; `clamp-points` edits the
   * in-memory draft entity, which nothing saves.
   */
  async preview(
    input: CheckoutPreviewInput,
    actor: ActorContext,
  ): Promise<CheckoutPreview> {
    // A key no saga can ever carry: load-draft lets a non-draft invoice through
    // when a COMPLETED saga holds the request's idempotency key (so a genuine
    // replay reaches open-saga). A preview is never a replay — an already
    // checked-out invoice must be rejected, not priced.
    const key = `preview:${input.invoiceId}`;
    const ctx: CheckoutContext = {
      actor,
      input: {
        invoiceId: input.invoiceId,
        payments: [],
        selectedProgramIds: input.selectedProgramIds,
        excludedProgramIds: input.excludedProgramIds,
      },
      correlationId: key,
      idempotencyKey: key,
      dryRun: true,
    };
    const steps = this.previewSteps();
    await this.orchestrator.runPreflight(steps, ctx, new CheckoutTrace(), steps.length);

    const amounts = computeAmounts(ctx);
    const invoice = ctx.invoice!;
    return {
      totals: {
        subtotal: amounts.subtotal,
        manualDiscountAmount: amounts.manualDiscountAmount,
        promotionDiscount: amounts.promotionDiscount,
        pointsRedeemed: Number(invoice.pointsRedeemed ?? 0),
        pointsDiscountAmount: amounts.pointsDiscountAmount,
        depositAmount: amounts.depositAmount,
        amountDue: amounts.amountDue,
        // Same gates persist-invoice applies before storing it: no customer or a
        // programme with "Tích điểm" unchecked means no points. Showing the
        // ungated number would promise points the sale will never credit.
        pointsEarned:
          invoice.customerId && !amounts.pointsBlocked ? amounts.pointsEarned : 0,
      },
      appliedPrograms: ctx.promotion?.appliedPrograms ?? [],
      lineDiscounts: ctx.promotion?.lineDiscounts ?? [],
    };
  }

  /** Order matters: clamp-points needs the engine's discount from evaluate-promotion. */
  private previewSteps(): CheckoutStep[] {
    return [this.loadDraft, this.evaluatePromotion, this.clampPoints];
  }

  /**
   * Registration order === execution order (the orchestrator does not
   * reorder). All 20 steps are now wired — never renumber a step already
   * here so the trail stays comparable across slices.
   */
  private allSteps(): CheckoutStep[] {
    return [
      this.loadDraft,
      this.evaluatePromotion,
      this.resolveAccounts,
      this.resolveFunds,
      this.clampPoints,
      this.computeTotals,
      this.openSaga,
      this.lockInvoice,
      this.nextDocumentNumber,
      this.redeemVoucher,
      this.persistInvoice,
      this.persistPayments,
      this.createDebt,
      this.redeemPoints,
      this.deductStock,
      this.postJournal,
      this.postCash,
      this.postDeposit,
      this.enqueueOutbox,
      this.closeSaga,
    ];
  }
}
