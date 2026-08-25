import { ForbiddenException } from '@nestjs/common';
import { ReportStoreScope } from '@erp/shared-interfaces';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceStatus, InvoiceType } from '../../pos/entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../../pos/entities/invoice-item.entity';

/**
 * Structural shape `applyInvoiceStatusFilter` needs from a report's filter DTO.
 * Kept local (not imported from `invoice-report/dto`) so `report-core` stays the
 * base layer — `invoice-report` and `profit-report` both depend on it, not the
 * reverse. Any filter DTO with these fields satisfies this by structural typing.
 */
export interface InvoiceStatusFilterShape {
  invoiceStatus?: string[];
  status?: { value?: string | null };
}

export const CONSOLIDATED_PERMISSION = 'reporting.invoice.consolidated.read';

/**
 * Sign an invoice's header money contribution by type so returns net instead of
 * inflating report totals: RETURN subtracts, SALE and EXCHANGE add. (EXCHANGE's
 * goods are netted separately via `signedGoods`; its header money — e.g. the
 * extra collected — stays positive, and any cash refund is netted downstream.)
 */
export function invoiceTypeSign(type: InvoiceType): number {
  return type === InvoiceType.RETURN ? -1 : 1;
}

/**
 * Net goods contribution of one invoice, equal to Σ(OUT lineTotal) −
 * Σ(IN lineTotal): SALE = +subtotal, RETURN = −subtotal, EXCHANGE = netAmount
 * (newSubtotal − returnSubtotal), which nets the swap without re-summing lines.
 */
export function signedGoods(inv: {
  type: InvoiceType;
  subtotal: number;
  netAmount: number;
}): number {
  return inv.type === InvoiceType.EXCHANGE
    ? Number(inv.netAmount ?? 0)
    : invoiceTypeSign(inv.type) * Number(inv.subtotal ?? 0);
}

/**
 * Resolve the branch ids a report query must filter on.
 *
 * Returns `null` to mean "all branches in the org" (consolidated). Org-scoping
 * on every query already prevents cross-tenant leakage; this adds the
 * authorization layer: consolidating across all / multiple stores requires the
 * consolidated permission. A single own-branch request works without it.
 */
export function resolveBranchIds(
  hasConsolidated: boolean,
  store: ReportStoreScope | undefined,
  requestedBranchId: string | undefined,
  actor: ActorContext,
): string[] | null {
  if (store) {
    if (store.scope === 'all') {
      if (hasConsolidated) return null;
      if (actor.branchId) return [actor.branchId];
      throw new ForbiddenException('Consolidated access not granted');
    }
    // scope === 'group'
    const ids = [...new Set(store.storeIds ?? [])];
    if (!ids.length) {
      if (actor.branchId) return [actor.branchId];
      throw new ForbiddenException('No store selected');
    }
    if (hasConsolidated) return ids;
    if (actor.branchId && ids.length === 1 && ids[0] === actor.branchId) return ids;
    throw new ForbiddenException(
      'Consolidated access not granted for the selected stores',
    );
  }

  // Legacy single-branch path (back-compat with the existing search API).
  if (requestedBranchId) {
    if (hasConsolidated) return [requestedBranchId];
    if (actor.branchId && actor.branchId === requestedBranchId) {
      return [requestedBranchId];
    }
    throw new ForbiddenException(`Access denied for branch: ${requestedBranchId}`);
  }
  if (hasConsolidated) return null;
  if (!actor.branchId) {
    throw new ForbiddenException(
      'No branch scope available and consolidated access not granted',
    );
  }
  return [actor.branchId];
}

/** Apply the resolved branch scope to a query (no-op when null = all branches). */
export function applyBranchScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  branchIds: string[] | null,
): void {
  if (branchIds) {
    qb.andWhere(`${alias}.branchId IN (:...reportBranchIds)`, {
      reportBranchIds: branchIds,
    });
  }
}

/**
 * Apply the invoice status filter. Prefers the multi-select `invoiceStatus`,
 * falls back to the legacy single `status`, and otherwise excludes cancelled
 * invoices by default (an explicit list including 'cancelled' keeps them).
 */
export function applyInvoiceStatusFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  filters: InvoiceStatusFilterShape,
): void {
  const statuses = filters.invoiceStatus?.length
    ? filters.invoiceStatus
    : filters.status?.value
      ? [filters.status.value]
      : null;
  if (statuses?.length) {
    qb.andWhere(`${alias}.status IN (:...reportStatuses)`, {
      reportStatuses: statuses,
    });
  } else {
    qb.andWhere(`${alias}.status != :reportCancelled`, {
      reportCancelled: InvoiceStatus.CANCELLED,
    });
  }
}

/** Which invoice date column the report period filters on (default invoice date). */
export function statDateColumn(
  alias: string,
  filters: { statDateType?: 'invoice_date' | 'created_date' },
): string {
  return filters.statDateType === 'created_date'
    ? `${alias}.createdAt`
    : `${alias}.issuedAt`;
}

/**
 * Σ per invoice of each line's promotion contribution, signed by `direction`.
 *
 * The header column `invoices.discount_amount` only ever records the discount on
 * what was *sold*, so an EXCHANGE whose returned line carries a reversed
 * promotion shows nothing there. Summing the lines sees both legs.
 *
 * The sign comes from `direction` ALONE. Do not multiply by `invoiceTypeSign`:
 * a RETURN's lines are all `IN`, so `direction` has already negated it, and
 * signing twice flips it back to positive. This is the single easiest way to
 * get this function wrong.
 *
 * Returns aggregated numbers, never entities — `daily-sales-summary`
 * deliberately never touches `invoice_items`, and loading a month of lines into
 * memory to add them up would quietly change that report's memory profile.
 * An invoice with no lines gets no key at all (not a `0`).
 */
export async function loadSignedLineDiscounts(
  repo: Repository<InvoiceItemEntity>,
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!invoiceIds.length) return out;

  // Postgres caps bind parameters at 65535; chunk well under it.
  const CHUNK = 20_000;
  for (let i = 0; i < invoiceIds.length; i += CHUNK) {
    const ids = invoiceIds.slice(i, i + CHUNK);
    const rows = await repo
      .createQueryBuilder('line')
      .select('line.invoiceId', 'invoiceId')
      .addSelect(
        `SUM(CASE WHEN line.direction = :inDirection THEN -1 ELSE 1 END
             * (line.lineDiscount + line.promotionDiscount))`,
        'amount',
      )
      .where('line.invoiceId IN (:...ids)', { ids })
      .setParameter('inDirection', ItemDirection.IN)
      .groupBy('line.invoiceId')
      .getRawMany<{ invoiceId: string; amount: string }>();

    for (const r of rows) out.set(r.invoiceId, Number(r.amount ?? 0));
  }
  return out;
}
