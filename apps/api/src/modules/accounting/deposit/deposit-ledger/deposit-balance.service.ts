import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DepositMovementEntity } from '../deposit-movement.entity';

export interface DepositBalances {
  bookBalance: number;
  availableBalance: number;
  pendingClearingAmount: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * TKT-DFR-04 (R2) — book vs available balance. `bookBalance` is the same
 * signed sum as `DepositLedgerService` (doc_date scoped, gross `amount` for
 * DEPOSIT — the acquirer fee is its own separate WITHDRAWAL row, so summing
 * `amount` + the fee row already nets to post-fee; using `net_amount` here
 * would double-subtract the fee). `availableBalance` additionally excludes
 * movements whose `value_date` is still in the future (not yet cleared).
 */
@Injectable()
export class DepositBalanceService {
  constructor(
    @InjectRepository(DepositMovementEntity)
    private readonly movementRepo: Repository<DepositMovementEntity>,
  ) {}

  /**
   * @param asOfDate Restrict to `doc_date <= asOfDate` (period-close snapshots,
   * DFR-06); omit for the live balance (today).
   */
  async getBalances(
    depositAccountId: string,
    actor: ActorContext,
    asOfDate?: string,
    manager?: EntityManager,
  ): Promise<DepositBalances> {
    const repo = manager
      ? manager.getRepository(DepositMovementEntity)
      : this.movementRepo;
    const bookBalance = await this.sumSigned(repo, depositAccountId, actor, false, asOfDate);
    const availableBalance = await this.sumSigned(repo, depositAccountId, actor, true, asOfDate);
    return {
      bookBalance,
      availableBalance,
      pendingClearingAmount: round2(bookBalance - availableBalance),
    };
  }

  private async sumSigned(
    repo: Repository<DepositMovementEntity>,
    depositAccountId: string,
    actor: ActorContext,
    clearedOnly: boolean,
    asOfDate?: string,
  ): Promise<number> {
    const params: unknown[] = [depositAccountId, actor.organizationId];
    let where = `m.organization_id = $2 AND (m.deposit_account_id = $1 OR m.to_account_id = $1)`;
    if (actor.branchId) {
      params.push(actor.branchId);
      where += ` AND m.branch_id = $${params.length}`;
    }
    if (asOfDate) {
      params.push(asOfDate);
      where += ` AND m.doc_date <= $${params.length}::date`;
    }
    if (clearedOnly) {
      where += ` AND (m.value_date IS NULL OR m.value_date <= CURRENT_DATE)`;
    }
    const signed = `CASE
      WHEN m.type = 'DEPOSIT' THEN m.amount
      WHEN m.type = 'ADJUSTMENT' THEN m.amount
      WHEN m.type = 'WITHDRAWAL' THEN -m.amount
      WHEN m.type = 'TRANSFER' AND m.deposit_account_id = $1 THEN -m.amount
      WHEN m.type = 'TRANSFER' AND m.to_account_id = $1 THEN m.amount
      ELSE 0
    END`;
    const rows = await repo.query(
      `SELECT COALESCE(SUM(${signed}), 0) AS sum FROM deposit_movements m WHERE ${where}`,
      params,
    );
    return round2(Number(rows[0]?.sum ?? 0));
  }
}
