import type { EntityManager } from 'typeorm';
import type { WsEvent } from '@erp/shared-interfaces';
import type { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import type { InvoiceEntity, InvoicePaymentMethod, InvoiceStatus } from '../../entities/invoice.entity';
import type { InvoiceItemEntity } from '../../entities/invoice-item.entity';
import type { InvoicePaymentEntity } from '../../entities/invoice-payment.entity';

/**
 * Contracts for the v2 checkout saga.
 *
 * LOCK ORDER — every transactional step must take row locks in this order, and
 * only this order. Taking them in a different order across two concurrent
 * checkouts is how this flow would deadlock:
 *
 *   invoices -> document_number_counters -> membership_cards -> invoice_debts -> vouchers
 *
 * If a new step needs a lock on something not listed here, add it to the list in
 * the position it must be taken, do not just take it wherever the code happens
 * to sit.
 */

export type CheckoutStepPhase = 'preflight' | 'transactional';

export type CheckoutStepStatus = 'OK' | 'FAILED' | 'SKIPPED';

/**
 * One unit of work in the checkout. Steps read what earlier steps produced from
 * the context and write their own result back onto it — never through
 * parameters. That is what lets the step list change without touching a single
 * step signature.
 */
export interface CheckoutStep {
  readonly name: string;
  readonly phase: CheckoutStepPhase;
  execute(ctx: CheckoutContext): Promise<void>;
  /**
   * Only for steps that cannot join the transaction. Everything that writes
   * through `ctx.manager` is compensated by ROLLBACK and must not implement
   * this — see ADR-03 in 03-logical-design.md.
   */
  compensate?(ctx: CheckoutContext): Promise<void>;
}

/** One payment line as accepted from the client. Amounts are authoritative; account ids are not. */
export interface CheckoutPaymentInput {
  paymentMethod: InvoicePaymentMethod;
  amount: number;
  /** A configured `payment_accounts` row, never a chart-of-accounts id. */
  paymentAccountId?: string;
  reference?: string;
}

/**
 * The request shape the saga needs. Declared here rather than imported from the
 * DTO so the application layer does not depend on the HTTP layer; the DTO
 * satisfies this interface structurally.
 */
export interface CheckoutInput {
  invoiceId: string;
  payments: CheckoutPaymentInput[];
  /**
   * Change the customer declined to take back. Never part of `payments` — see
   * `CheckoutTotals.keptChange`.
   */
  keptChangeAmount?: number;
  dueDate?: string;
  creditDays?: number;
  /**
   * Dual meaning (ADR-03 in pos-promotion-apply/03-logical-design.md): turns
   * on an `auto_apply=false` program, and/or makes a listed program win a
   * contested resource ahead of `priority` (PromotionResolver.resolve),
   * including one that's `auto_apply=true` and currently winning. Amounts
   * are never taken from the client either way.
   */
  selectedProgramIds?: string[];
  /**
   * ADR-07 (pos-promotion-apply/03-logical-design.md) — ids to keep out of
   * the race entirely, filtered out before `selectedProgramIds` is even
   * consulted (PromotionResolver.resolve). The inverse of
   * `selectedProgramIds`: always exclude, never add. Wins on conflict if an
   * id is in both.
   */
  excludedProgramIds?: string[];
  voucherCode?: string;
  dryRun?: boolean;
}

/** Receiving accounts for one payment line, resolved server-side from configuration. */
export interface ResolvedPaymentAccount {
  accountId: string;
  depositAccountId?: string;
}

export interface ResolvedAccounts {
  revenueAccountId: string;
  receivableAccountId?: string;
  /** Index-aligned with `CheckoutInput.payments`. */
  perPayment: ResolvedPaymentAccount[];
}

export interface ResolvedFunds {
  /** The branch cash fund (`cash_accounts.id`, NOT a COA id). Absent when there is no CASH line. */
  cashAccountId?: string;
}

/** What the promotion engine decided. Populated by the evaluate-promotion step. */
export interface PromotionOutcome {
  promotionDiscount: number;
  appliedPrograms: unknown[];
  lineDiscounts: unknown[];
}

export interface CheckoutTotals {
  subtotal: number;
  /** Discount the cashier entered on the draft. */
  manualDiscountAmount: number;
  /** Discount the promotion engine computed. Zero until UOW-04. */
  promotionDiscount: number;
  pointsDiscountAmount: number;
  depositAmount: number;
  amountDue: number;
  totalPaid: number;
  remainder: number;
  /**
   * Surplus cash left in the drawer ("Khách không lấy tiền thừa"). Excluded
   * from `totalPaid` and from revenue on purpose: it is booked as other income
   * by its own Phiếu thu (enqueue-outbox), so the till matches the cash
   * physically in it. Zero unless the client sent `keptChangeAmount`.
   */
  keptChange: number;
  pointsEarned: number;
  newStatus: InvoiceStatus;
}

/**
 * State carried through the run. Slots are filled by the step that owns them and
 * read by later steps; `undefined` means "the step that produces this has not
 * run yet".
 */
export interface CheckoutContext {
  readonly actor: ActorContext;
  readonly input: CheckoutInput;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly dryRun: boolean;

  /** Set once the saga row exists (transactional phase). */
  sagaId?: string;
  /** Present only inside the transaction. A step that writes without this is a bug. */
  manager?: EntityManager;

  invoice?: InvoiceEntity;
  items?: InvoiceItemEntity[];
  promotion?: PromotionOutcome;
  accounts?: ResolvedAccounts;
  funds?: ResolvedFunds;
  totals?: CheckoutTotals;
  documentNumber?: string;
  voucherId?: string;
  /** Set by persist-payments; index-aligned with input.payments. */
  savedPayments?: InvoicePaymentEntity[];
  /** Set by open-saga when a completed saga with the same key is replayed. */
  replayed?: boolean;
  /**
   * Set by enqueue-outbox — content only, never emitted from inside the
   * step. Emitting from a transactional step (before COMMIT) would show the
   * cashier's screen a "checkout acknowledged" notification for a sale that
   * might still roll back; the orchestrator emits this itself, once, only
   * after the transaction actually commits (see CHECKOUT_WS_EMITTER).
   */
  wsNotification?: WsEvent;
  /**
   * The orchestrator's own trace, exposed read-only so `close-saga` can flush
   * every prior step's row (its own row is not in here yet — the orchestrator
   * appends it only after `close-saga.execute` returns, too late for
   * close-saga to persist itself that way, so it constructs and appends its
   * own row by hand). Set once, at the start of a run.
   */
  trace?: CheckoutTrace;
}

export interface CheckoutStepRecord {
  seq: number;
  name: string;
  phase: CheckoutStepPhase;
  status: CheckoutStepStatus;
  startedAt: Date;
  durationMs: number;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * The step trail, held in memory for the length of one run.
 *
 * It is deliberately not written row-by-row: on a failed run the transaction
 * rolls back and would take the rows with it, so the trail is flushed by
 * close-saga on success, and by a second transaction after rollback on failure
 * (ADR-01).
 */
export class CheckoutTrace {
  private readonly records: CheckoutStepRecord[] = [];

  record(entry: CheckoutStepRecord): void {
    this.records.push(entry);
  }

  get entries(): readonly CheckoutStepRecord[] {
    return this.records;
  }

  get length(): number {
    return this.records.length;
  }

  get failed(): CheckoutStepRecord | undefined {
    return this.records.find((r) => r.status === 'FAILED');
  }

  totalDurationMs(): number {
    return this.records.reduce((sum, r) => sum + r.durationMs, 0);
  }
}

/**
 * What the orchestrator reports progress to. The implementation lives in
 * infrastructure/checkout-trace.logger.ts; declaring the seam here keeps the
 * orchestrator free of a logging dependency it cannot unit-test around.
 */
export interface CheckoutStepLogger {
  stepFinished(ctx: CheckoutContext, record: CheckoutStepRecord, totalSteps: number): void;
  runRolledBack(ctx: CheckoutContext, trace: CheckoutTrace, totalSteps: number): void;
}

export const CHECKOUT_STEP_LOGGER = Symbol('CHECKOUT_STEP_LOGGER');

/**
 * Persists a FAILED saga row + its full step trail after the main transaction
 * has already rolled back (ADR-01). Runs in its own, separate transaction —
 * the row `open-saga` wrote inside the failed transaction is gone along with
 * everything else, so this recreates it rather than updating it.
 *
 * A distinct port from `CheckoutStepLogger`: this one persists to the
 * database and can itself fail, which the orchestrator must treat as a
 * warning, never as a reason to hide the original error (see
 * checkout-saga.orchestrator.ts).
 */
export interface CheckoutFailureRecorder {
  record(ctx: CheckoutContext, trace: CheckoutTrace, error: unknown): Promise<void>;
}

export const CHECKOUT_FAILURE_RECORDER = Symbol('CHECKOUT_FAILURE_RECORDER');

/**
 * Emits `ctx.wsNotification` (if any step set one) after a successful commit.
 * A distinct port so the orchestrator never imports `WebSocketEmitterService`
 * directly (the same "no business/infra dependency" reasoning as the other
 * two ports) — the real implementation lives in
 * infrastructure/checkout-ws-notifier.ts. Best-effort: the orchestrator wraps
 * this in try/catch itself (see runTransactional) — a dropped WS notification
 * is not a reason to fail an already-committed checkout.
 */
export interface CheckoutWsEmitter {
  emit(ctx: CheckoutContext): void;
}

export const CHECKOUT_WS_EMITTER = Symbol('CHECKOUT_WS_EMITTER');

/**
 * Every transactional step must write through `ctx.manager`, never through a
 * module-level `@InjectRepository` binding — the latter runs on the default
 * connection, outside the saga's transaction, silently breaking ADR-01's
 * whole point. This guard turns "ran outside a transaction" into a defect
 * (500 `CHECKOUT_FAILED`, decorated by the orchestrator) rather than a step
 * quietly writing outside the transaction it was told it was in.
 */
export function requireManager(ctx: CheckoutContext, stepName: string): EntityManager {
  if (!ctx.manager) {
    throw new Error(`${stepName} ran outside a transaction`);
  }
  return ctx.manager;
}
