import { v5 as uuidv5 } from 'uuid';
import {
  CashVoucherNeededPayload,
  DomainEvent,
  DomainEventType,
} from '@erp/shared-interfaces';

/** Stable namespace for deterministic cash-voucher event ids. */
const CASH_VOUCHER_NS = '7c0c5d2e-2a1a-4f0e-9b6e-2f6d8c0a1b2c';

/**
 * Deterministic event id keyed by (sourceType, sourceId). Re-publishing the same
 * source event (outbox at-least-once / replay) yields the same eventId, so the
 * consumer's `processed_events` dedupe treats it as already processed.
 */
export function deterministicCashVoucherEventId(
  sourceType: string,
  sourceId: string,
): string {
  return uuidv5(`cash.voucher.needed:${sourceType}:${sourceId}`, CASH_VOUCHER_NS);
}

/** Build the `cash.voucher.needed.*` domain event for an A-revised source. */
export function buildCashVoucherNeededEvent(
  payload: CashVoucherNeededPayload,
): DomainEvent<CashVoucherNeededPayload> {
  return {
    eventId: deterministicCashVoucherEventId(payload.sourceType, payload.sourceId),
    eventType: DomainEventType.CASH_VOUCHER_NEEDED,
    timestamp: new Date().toISOString(),
    organizationId: payload.organizationId,
    branchId: payload.branchId,
    correlationId: payload.sourceId,
    payload,
  };
}
