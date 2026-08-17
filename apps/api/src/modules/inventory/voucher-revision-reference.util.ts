import { v5 as uuidv5 } from "uuid";

/**
 * Stable namespace for deterministic voucher-revision reference ids.
 * Ad-hoc, distinct from `CASH_VOUCHER_NS` in `modules/events/outbox` — this
 * mints `cash_payments.reference_id` / `cash_receipts.reference_id` values, an
 * unrelated concern from the outbox's event ids.
 */
const VOUCHER_REVISION_NS = "b6a2b1a0-6b7e-4a6a-8b7e-1c9f1c9f1c9f";

/**
 * A deterministic UUID for the `referenceId` of the cash voucher that adjusts
 * a warehouse voucher's value delta on a given revision.
 *
 * `CashPaymentsService.createAndPostInternal` / `CashReceiptsService.createAndPostInternal`
 * dedupe on the exact pair `(referenceType, referenceId)` — the same pair the
 * voucher's *first* posting already occupies (`referenceId = voucher.id`), so an
 * adjustment cannot reuse it without being silently swallowed as a replay of the
 * original posting. Keying off `(voucherId, revision)` instead gives each edit
 * its own slot: a genuine retry of the same edit (same revision) still replays
 * safely, and the next edit (next revision) is not.
 *
 * The id is not a real `goods_receipts`/`goods_issues` row — `referenceId` here
 * carries no FK constraint, only a `uuid` column type — so the voucher list's
 * "jump to source document" link degrades to no-op for adjustment rows. The
 * source voucher's number is still readable in the adjustment's own description.
 */
export function deterministicVoucherRevisionReferenceId(
  voucherId: string,
  revision: number,
): string {
  return uuidv5(`voucher-revision:${voucherId}:${revision}`, VOUCHER_REVISION_NS);
}
