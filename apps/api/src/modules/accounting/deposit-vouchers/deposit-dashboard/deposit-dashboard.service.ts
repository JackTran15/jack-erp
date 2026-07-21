import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepositAccountStatus, DepositTransferStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { BankEntity } from '../../deposit/bank.entity';
import { DepositAccountEntity } from '../../deposit/deposit-account.entity';
import { DepositTransferEntity } from '../deposit-transfer/deposit-transfer.entity';
import { InTransitQueryDto } from './dto/in-transit-query.dto';
import {
  AccountBalanceDto,
  BranchBalanceDto,
  InTransitReportDto,
  InTransitRowDto,
  OrgBalanceDashboardDto,
} from './dto/deposit-dashboard-response.dto';

const DEFAULT_STALE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const round2 = (v: number): number => Math.round(v * 100) / 100;
const sumMoney = (values: Array<string | number>): number =>
  round2(values.reduce<number>((s, v) => s + Number(v), 0));

/**
 * Read-only reporting for GĐ4 — the in-transit report and the multi-branch
 * balance dashboard. Both aggregate in RAM (fetch raw rows, group/sum in JS)
 * and join FK names inline per-row, per convention — no SQL GROUP BY/window
 * functions, no root `{[id]: X}` map returned to the client.
 */
@Injectable()
export class DepositDashboardService {
  constructor(
    @InjectRepository(DepositTransferEntity)
    private readonly transfers: Repository<DepositTransferEntity>,
    @InjectRepository(DepositAccountEntity)
    private readonly accounts: Repository<DepositAccountEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(BankEntity)
    private readonly banks: Repository<BankEntity>,
  ) {}

  /** BR-TRF-02 / R5 — every transfer still DANG_CHUYEN within the actor's branch scope. */
  async getInTransit(
    query: InTransitQueryDto,
    actor: ActorContext,
  ): Promise<InTransitReportDto> {
    const allowed = this.allowedBranchIds(actor, query.branchId);
    const staleDays = query.staleDays ?? DEFAULT_STALE_DAYS;

    const rows = await this.transfers.find({
      where: { organizationId: actor.organizationId, status: DepositTransferStatus.DANG_CHUYEN },
      order: { initiatedAt: 'ASC' },
    });
    // BR-PERM-01: a transfer is visible if EITHER leg's branch is one the actor is assigned to.
    const inScope = rows.filter(
      (t) =>
        (allowed.includes(t.fromBranchId) || allowed.includes(t.toBranchId)) &&
        (!query.accountId || t.fromAccountId === query.accountId || t.toAccountId === query.accountId),
    );

    const branchIds = [...new Set(inScope.flatMap((t) => [t.fromBranchId, t.toBranchId]))];
    const accountIds = [...new Set(inScope.flatMap((t) => [t.fromAccountId, t.toAccountId]))];
    const [branchNames, accountNames] = await Promise.all([
      this.branchNameMap(branchIds),
      this.accountNameMap(accountIds),
    ]);

    const now = Date.now();
    const data: InTransitRowDto[] = inScope.map((t) => {
      const days = Math.floor((now - new Date(t.initiatedAt).getTime()) / MS_PER_DAY);
      return {
        id: t.id,
        amount: String(Number(t.amount)),
        fromBranchId: t.fromBranchId,
        fromBranchName: branchNames.get(t.fromBranchId) ?? null,
        toBranchId: t.toBranchId,
        toBranchName: branchNames.get(t.toBranchId) ?? null,
        fromAccountName: accountNames.get(t.fromAccountId) ?? null,
        toAccountName: accountNames.get(t.toAccountId) ?? null,
        initiatedAt: t.initiatedAt.toISOString(),
        initiatedBy: t.initiatedBy,
        daysInTransit: days,
        isOverdue: days > staleDays,
      };
    });

    return {
      total: String(sumMoney(data.map((d) => d.amount))),
      staleDays,
      data,
    };
  }

  /** Multi-branch balance dashboard; grandTotal = Σ(deposit_accounts.balance) + Σ(in-transit) — R5 invariant. */
  async getOrgBalance(actor: ActorContext): Promise<OrgBalanceDashboardDto> {
    const allowed = this.allowedBranchIds(actor);

    const accs = (
      await this.accounts.find({
        where: { organizationId: actor.organizationId, status: DepositAccountStatus.ACTIVE },
      })
    ).filter((a) => allowed.includes(a.branchId)); // BR-PERM-01, applied before any total is computed

    const branchesById = new Map<string, DepositAccountEntity[]>();
    for (const acc of accs) {
      const list = branchesById.get(acc.branchId) ?? [];
      list.push(acc);
      branchesById.set(acc.branchId, list);
    }
    const branchNames = await this.branchNameMap([...branchesById.keys()]);
    const bankNames = await this.bankNameMap([...new Set(accs.map((a) => a.bankId))]);

    const branches: BranchBalanceDto[] = [...branchesById.entries()].map(([branchId, list]) => {
      const accountRows: AccountBalanceDto[] = list.map((a) => ({
        accountId: a.id,
        name: a.name,
        type: a.type,
        balance: String(Number(a.balance)),
        bankName: bankNames.get(a.bankId) ?? '',
        accountNo: a.accountNo,
      }));
      return {
        branchId,
        branchName: branchNames.get(branchId) ?? null,
        accounts: accountRows,
        branchTotal: String(sumMoney(accountRows.map((a) => a.balance))),
      };
    });

    const accountsTotal = sumMoney(branches.map((b) => b.branchTotal));
    const inTransit = await this.getInTransit({}, actor);

    return {
      branches,
      accountsTotal: String(accountsTotal),
      inTransitTotal: inTransit.total,
      grandTotal: String(round2(accountsTotal + Number(inTransit.total))),
    };
  }

  /**
   * Branches the actor may see. `branchIds` is the JWT allow-list — empty means
   * no branch access (not "unrestricted"), matching ActorContext's own
   * documented contract; an org-wide accountant simply has every branch in
   * that list. An explicit `branchId` filter further narrows it (still subject
   * to being in the allow-list).
   */
  private allowedBranchIds(actor: ActorContext, explicitBranchId?: string): string[] {
    const assigned = actor.branchIds ?? (actor.branchId ? [actor.branchId] : []);
    if (!explicitBranchId) return assigned;
    return assigned.includes(explicitBranchId) ? [explicitBranchId] : [];
  }

  private async branchNameMap(branchIds: string[]): Promise<Map<string, string>> {
    if (branchIds.length === 0) return new Map();
    const rows = await this.branches.find({ where: branchIds.map((id) => ({ id })) });
    return new Map(rows.map((b) => [b.id, b.name]));
  }

  private async accountNameMap(accountIds: string[]): Promise<Map<string, string>> {
    if (accountIds.length === 0) return new Map();
    const rows = await this.accounts.find({ where: accountIds.map((id) => ({ id })) });
    return new Map(rows.map((a) => [a.id, a.name]));
  }

  private async bankNameMap(bankIds: string[]): Promise<Map<string, string>> {
    if (bankIds.length === 0) return new Map();
    const rows = await this.banks.find({ where: bankIds.map((id) => ({ id })) });
    return new Map(rows.map((b) => [b.id, b.shortName || b.name]));
  }
}
