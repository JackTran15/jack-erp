import { Injectable } from '@nestjs/common';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

/**
 * Describes one debt-ledger source for the period aggregation below — either
 * the "increase" side (e.g. invoice_debts.originalAmount, party id directly on
 * the row) or the "decrease" side (e.g. debt_payments.amount, which only has
 * `debtId` — the party id is reached via `join`, e.g. joined to invoice_debts
 * for its customerId). Expressions are alias-qualified TypeORM property paths
 * (the query root is always aliased `t`), not raw user input, so this stays
 * within parameterized query builder usage.
 */
export interface DebtLedgerSource<T extends ObjectLiteral> {
  repo: Repository<T>;
  /** Alias-qualified party id, e.g. 't.customerId' or 'debt.customerId' when `join` resolves it. */
  partyIdExpr: string;
  /** Alias-qualified money amount to sum, e.g. 't.originalAmount'. */
  amountExpr: string;
  /** Alias-qualified date the transaction occurred, e.g. 't.issuedAt'. */
  dateExpr: string;
  /** Alias-qualified branch id, when branch narrowing applies. */
  branchIdExpr?: string;
  /** Optional join needed to reach partyIdExpr/branchIdExpr (root alias is always `t`). */
  join?: (qb: SelectQueryBuilder<T>) => void;
  /** Optional extra `andWhere` (e.g. excluding DRAFT/VOIDED accounting receivables from counting as real debt). */
  filter?: (qb: SelectQueryBuilder<T>) => void;
}

export interface DebtPeriodQueryParams {
  organizationId: string;
  /** Narrow to these branches; omit/empty = every branch (org/chain-wide). */
  branchIds?: string[];
  /** Inclusive period start (ISO date). */
  fromDate: string;
  /** Inclusive period end (ISO date). */
  toDate: string;
}

/** One party's ledger deltas for a period, before closing balance is computed. */
export interface PartyLedgerDelta {
  partyId: string;
  /** Balance accumulated strictly before `fromDate`. */
  opening: number;
  /** Sum of increase-side amounts within [fromDate, toDate]. */
  increase: number;
  /** Sum of decrease-side amounts within [fromDate, toDate]. */
  decrease: number;
}

export interface PartyLedgerRow extends PartyLedgerDelta {
  /** opening + increase − decrease. */
  closing: number;
}

interface OpeningAndPeriod {
  opening: number;
  period: number;
}

/**
 * Shared "period ledger" aggregation for debt reports — the opening/increase/
 * decrease/closing-balance pattern (mirrors StockPeriodService's opening/in/
 * out/closing for inventory, applied to a two-sided debt ledger instead of a
 * single signed-quantity ledger). Each debt report definition supplies its own
 * increase/decrease source (which entity, which columns, how to reach the
 * party id); this service only knows how to aggregate and merge, not what a
 * "customer" or "supplier" means.
 */
@Injectable()
export class DebtPeriodService {
  /**
   * Aggregate opening (before `fromDate`) + in-period increase/decrease per
   * party, merged from the two ledger sides into one row per party id.
   */
  async getPeriodLedger<TInc extends ObjectLiteral, TDec extends ObjectLiteral>(
    increaseSource: DebtLedgerSource<TInc>,
    decreaseSource: DebtLedgerSource<TDec>,
    params: DebtPeriodQueryParams,
  ): Promise<PartyLedgerDelta[]> {
    const [increases, decreases] = await Promise.all([
      this.aggregateOpeningAndPeriod(increaseSource, params),
      this.aggregateOpeningAndPeriod(decreaseSource, params),
    ]);
    return mergeLedgerSides(increases, decreases);
  }

  private async aggregateOpeningAndPeriod<T extends ObjectLiteral>(
    source: DebtLedgerSource<T>,
    params: DebtPeriodQueryParams,
  ): Promise<Map<string, OpeningAndPeriod>> {
    const qb = source.repo.createQueryBuilder('t');
    source.join?.(qb);
    qb.select(`${source.partyIdExpr}`, 'partyId')
      .addSelect(
        `COALESCE(SUM(CASE WHEN ${source.dateExpr} < :fromDate THEN ${source.amountExpr} ELSE 0 END), 0)`,
        'opening',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ${source.dateExpr} >= :fromDate AND ${source.dateExpr} <= :toDate THEN ${source.amountExpr} ELSE 0 END), 0)`,
        'period',
      )
      .where('t.organizationId = :organizationId', {
        organizationId: params.organizationId,
      })
      .groupBy(source.partyIdExpr);
    source.filter?.(qb);

    if (params.branchIds?.length && source.branchIdExpr) {
      qb.andWhere(`${source.branchIdExpr} IN (:...branchIds)`, {
        branchIds: params.branchIds,
      });
    }
    qb.setParameters({ fromDate: params.fromDate, toDate: params.toDate });

    const rows = await qb.getRawMany<{
      partyId: string;
      opening: string;
      period: string;
    }>();
    return new Map(
      rows
        .filter((r) => r.partyId != null)
        .map((r) => [
          r.partyId,
          { opening: Number(r.opening), period: Number(r.period) },
        ]),
    );
  }
}

/** Merge the increase-side and decrease-side per-party aggregates into deltas. */
export function mergeLedgerSides(
  increases: Map<string, OpeningAndPeriod>,
  decreases: Map<string, OpeningAndPeriod>,
): PartyLedgerDelta[] {
  const partyIds = new Set([...increases.keys(), ...decreases.keys()]);
  return [...partyIds].map((partyId) => {
    const inc = increases.get(partyId) ?? { opening: 0, period: 0 };
    const dec = decreases.get(partyId) ?? { opening: 0, period: 0 };
    return {
      partyId,
      opening: inc.opening - dec.opening,
      increase: inc.period,
      decrease: dec.period,
    };
  });
}

/** Merge multiple partial ledgers for the SAME party grain (e.g. POS debt + accounting receivable) by summing each field, one entry per distinct party id. */
export function mergeLedgerDeltas(
  sources: PartyLedgerDelta[][],
): PartyLedgerDelta[] {
  const byParty = new Map<string, PartyLedgerDelta>();
  for (const source of sources) {
    for (const delta of source) {
      const existing = byParty.get(delta.partyId) ?? {
        partyId: delta.partyId,
        opening: 0,
        increase: 0,
        decrease: 0,
      };
      byParty.set(delta.partyId, {
        partyId: delta.partyId,
        opening: existing.opening + delta.opening,
        increase: existing.increase + delta.increase,
        decrease: existing.decrease + delta.decrease,
      });
    }
  }
  return [...byParty.values()];
}

/** Compute the closing balance for a delta: opening + increase − decrease. */
export function closeLedger(delta: PartyLedgerDelta): PartyLedgerRow {
  return { ...delta, closing: delta.opening + delta.increase - delta.decrease };
}
