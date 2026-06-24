import { ForbiddenException } from '@nestjs/common';
import { ReportStoreScope } from '@erp/shared-interfaces';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceStatus } from '../../pos/entities/invoice.entity';
import { InvoiceReportFilterDto } from './dto/invoice-report-filter.dto';

export const CONSOLIDATED_PERMISSION = 'reporting.invoice.consolidated.read';

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
  filters: InvoiceReportFilterDto,
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
  filters: InvoiceReportFilterDto,
): string {
  return filters.statDateType === 'created_date'
    ? `${alias}.createdAt`
    : `${alias}.issuedAt`;
}
