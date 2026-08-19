import { Injectable } from '@nestjs/common';
import { v5 as uuidv5 } from 'uuid';
import { DomainEventType, WsEventType } from '@erp/shared-interfaces';
import type {
  KeptChangeCashPayload,
  TempWarehouseInvoiceFulfillRequestedPayload,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { OutboxService } from '../../../../events/outbox/outbox.service';
import { LoyaltyPointsAwardPayload } from '../../../../customer/publishers/loyalty-points.publisher';

/** Stable namespace for checkout-saga's own deterministic event ids (distinct from CASH_VOUCHER_NS). */
const CHECKOUT_SAGA_NS = 'b4b8b6d0-6f3f-4b8d-9b0e-2e3c9a7d4f11';

/**
 * Keyed by (topic, invoiceId): every retry of the same real commit (there is
 * only ever one, per T-02-02's replay guard, but this costs nothing and closes
 * off a whole class of at-least-once duplicate-processing risk if the outbox
 * relay ever redelivers) produces the same id per topic, so a consumer's
 * `processed_events` dedupe treats a redelivery as already-processed. Same
 * pattern as `deterministicCashVoucherEventId` in deterministic-event.ts —
 * kept local here rather than extending that file, which is cash-voucher-only.
 */
function deterministicCheckoutEventId(topic: string, invoiceId: string): string {
  return uuidv5(`checkout-saga:${topic}:${invoiceId}`, CHECKOUT_SAGA_NS);
}

/**
 * Enqueues the sale's remaining async side effects — in the same transaction,
 * so a rollback takes them with it and a commit guarantees they are sent
 * (ADR-04). Parity target: `checkout-invoice.service.ts:328-467`.
 *
 * Three outbox rows: `SALE_POSTED`, `TEMP_WAREHOUSE_INVOICE_FULFILL`,
 * `LOYALTY_POINTS_AWARD` (customer-less invoices get none of the last one —
 * same guard `LoyaltyPointsPublisher.publish` already has), plus a fourth,
 * `CASH_VOUCHER_NEEDED_KEPT_CHANGE`, only when the customer left change
 * behind. That last one stays async on purpose (v1 parity): its consumer
 * resolves the OTHER_INCOME account itself, so a missing default parks the
 * money in the DLQ instead of failing the sale at the counter. Does NOT publish
 * `JOURNAL_POST_SALE` / `STOCK_DEDUCTION` / `CASH_MOVEMENT_FROM_PAYMENT` /
 * `DEPOSIT_VOUCHER_NEEDED_POS_SALE` (ADR-03 — those four are what T-03-01..04
 * replaced with inline writes).
 *
 * The WS "checkout acknowledged" notification is NOT enqueued as a fourth
 * outbox row. The outbox is Kafka-shaped (`OutboxRelayService` publishes rows
 * to Kafka topics); there is no consumer that turns a Kafka message back into
 * a `WebSocketEmitterService.emitToBranch` call, and building one just for
 * this would be new, unplanned infrastructure for a notification that is
 * inherently best-effort and not something a client benefits from receiving
 * ~2s late via redelivery. Instead this step only sets `ctx.wsNotification`
 * (content, not delivery) — the orchestrator emits it directly, once, after
 * the transaction actually commits (see checkout-saga.orchestrator.ts).
 *
 * A-10, verified while implementing this step: `MembershipCardService.
 * awardPointsForInvoice` opens its own `dataSource.transaction(...)` and does
 * not accept a `manager` — genuinely non-composable, confirming ADR-04's
 * already-chosen fallback (EARN stays async via outbox) was the only option,
 * not just the cautious one.
 */
@Injectable()
export class EnqueueOutboxStep implements CheckoutStep {
  readonly name = 'enqueue-outbox';
  readonly phase = 'transactional' as const;

  constructor(private readonly outbox: OutboxService) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const items = ctx.items;
    const totals = ctx.totals;
    if (!invoice || !items || !totals) {
      throw new Error(
        'enqueue-outbox ran before its prerequisite steps populated the context',
      );
    }

    const now = new Date().toISOString();
    const organizationId = ctx.actor.organizationId;
    const branchId = invoice.branchId;

    await this.outbox.enqueue(
      manager,
      ERP_TOPICS.SALE_POSTED,
      {
        eventId: deterministicCheckoutEventId(ERP_TOPICS.SALE_POSTED, invoice.id),
        eventType: DomainEventType.SALE_POSTED,
        timestamp: now,
        organizationId,
        branchId,
        correlationId: invoice.id,
        payload: {
          invoiceId: invoice.id,
          documentNumber: ctx.documentNumber,
          totalAmount: totals.amountDue,
          actorId: ctx.actor.userId,
        },
      },
      invoice.id,
    );

    const fulfillByItem = new Map<string, number>();
    for (const item of items) {
      fulfillByItem.set(
        item.itemId,
        (fulfillByItem.get(item.itemId) ?? 0) + Number(item.quantity),
      );
    }
    const fulfillPayload: TempWarehouseInvoiceFulfillRequestedPayload = {
      organizationId,
      branchId: branchId!,
      invoiceId: invoice.id,
      invoiceNumber: ctx.documentNumber!,
      actor: {
        userId: ctx.actor.userId,
        organizationId,
        branchId: ctx.actor.branchId,
        roles: ctx.actor.roles,
      },
      lines: [...fulfillByItem.entries()].map(([itemId, quantity]) => ({
        itemId,
        quantity,
      })),
    };
    await this.outbox.enqueue(
      manager,
      ERP_TOPICS.TEMP_WAREHOUSE_INVOICE_FULFILL,
      {
        eventId: deterministicCheckoutEventId(ERP_TOPICS.TEMP_WAREHOUSE_INVOICE_FULFILL, invoice.id),
        eventType: DomainEventType.TEMP_WAREHOUSE_INVOICE_FULFILL_REQUESTED,
        timestamp: now,
        organizationId,
        branchId,
        correlationId: invoice.id,
        payload: fulfillPayload,
      },
      invoice.id,
    );

    if (invoice.customerId && !totals.pointsBlocked) {
      const loyaltyPayload: LoyaltyPointsAwardPayload = {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        subtotal: totals.amountDue,
        issuedAt: invoice.issuedAt?.toISOString(),
        branchId,
        organizationId,
        actorId: ctx.actor.userId,
      };
      await this.outbox.enqueue(
        manager,
        ERP_TOPICS.LOYALTY_POINTS_AWARD,
        {
          eventId: deterministicCheckoutEventId(ERP_TOPICS.LOYALTY_POINTS_AWARD, invoice.id),
          eventType: DomainEventType.LOYALTY_POINTS_AWARD_REQUESTED,
          timestamp: now,
          organizationId,
          branchId,
          correlationId: invoice.id,
          payload: loyaltyPayload,
        },
        invoice.customerId,
      );
    }

    // Surplus cash the customer declined to take back — its own Phiếu thu
    // against thu nhập khác, never revenue. `compute-totals` already refused a
    // kept change without a CASH line, so `resolve-funds` has a till here; the
    // sale's own payments were already posted to that same fund inline by
    // `post-cash`, and this row only adds the surplus on top.
    if (totals.keptChange > 0) {
      const cashAccountId = ctx.funds?.cashAccountId;
      if (!cashAccountId) {
        throw new Error(
          'enqueue-outbox: kept change was accepted but resolve-funds did not resolve a cashAccountId',
        );
      }
      const keptChangePayload: KeptChangeCashPayload = {
        invoiceId: invoice.id,
        invoiceCode: ctx.documentNumber!,
        cashAccountId,
        amount: totals.keptChange,
        branchId,
        organizationId,
        actorId: ctx.actor.userId,
      };
      await this.outbox.enqueue(
        manager,
        ERP_TOPICS.CASH_VOUCHER_NEEDED_KEPT_CHANGE,
        {
          eventId: deterministicCheckoutEventId(
            ERP_TOPICS.CASH_VOUCHER_NEEDED_KEPT_CHANGE,
            invoice.id,
          ),
          eventType: DomainEventType.CASH_VOUCHER_NEEDED_KEPT_CHANGE,
          timestamp: now,
          organizationId,
          branchId,
          correlationId: invoice.id,
          payload: keptChangePayload,
        },
        cashAccountId,
      );
    }

    ctx.wsNotification = {
      eventId: deterministicCheckoutEventId('ws.pos.checkout.acknowledged', invoice.id),
      eventType: WsEventType.POS_CHECKOUT_ACKNOWLEDGED,
      timestamp: now,
      organizationId,
      branchId,
      correlationId: invoice.id,
      payload: {
        invoiceId: invoice.id,
        documentNumber: ctx.documentNumber,
        totalAmount: totals.amountDue,
      },
    };
  }
}
