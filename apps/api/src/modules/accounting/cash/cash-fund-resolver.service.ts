import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CashAccountEntity } from './cash-account.entity';

/**
 * Resolves the single cash fund of a branch. In the one-fund-per-branch model
 * every branch owns exactly one `cash_accounts` row (mapped to COA "1111"), so
 * cash movements and reports never need a client-supplied cash account id — the
 * fund is derived from the branch. Pure read; provisioning lives in
 * {@link BranchCashProvisioningService}.
 */
@Injectable()
export class CashFundResolverService {
  constructor(private readonly dataSource: DataSource) {}

  /** Resolve the branch's single cash fund id. Throws when none or more than one exists. */
  async resolveBranchCashFund(
    organizationId: string,
    branchId: string | undefined,
    manager?: EntityManager,
  ): Promise<string> {
    if (!branchId) {
      throw new BadRequestException(
        'Branch scope is required to resolve the cash fund',
      );
    }
    const repo = (manager ?? this.dataSource.manager).getRepository(
      CashAccountEntity,
    );
    const rows = await repo.find({
      where: { organizationId, branchId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (rows.length === 0) {
      throw new BadRequestException(
        `No cash fund configured for branch ${branchId}`,
      );
    }
    if (rows.length > 1) {
      throw new BadRequestException(
        `Multiple cash funds found for branch ${branchId}; expected exactly one`,
      );
    }
    return rows[0].id;
  }

  /**
   * When `cashAccountId` is supplied, validate it is a real cash fund of the
   * branch (rejects a COA account id or a fund from another branch) and return
   * it; otherwise default to the branch's single fund.
   */
  async resolveOrDefault(
    organizationId: string,
    branchId: string | undefined,
    cashAccountId: string | undefined,
    manager?: EntityManager,
  ): Promise<string> {
    if (cashAccountId) {
      await this.assertBranchCashFund(
        organizationId,
        branchId,
        cashAccountId,
        manager,
      );
      return cashAccountId;
    }
    return this.resolveBranchCashFund(organizationId, branchId, manager);
  }

  /** Throw unless `cashAccountId` is a cash fund belonging to the org + branch. */
  async assertBranchCashFund(
    organizationId: string,
    branchId: string | undefined,
    cashAccountId: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (!branchId) {
      throw new BadRequestException(
        'Branch scope is required to validate the cash fund',
      );
    }
    const repo = (manager ?? this.dataSource.manager).getRepository(
      CashAccountEntity,
    );
    const found = await repo.findOne({
      where: { id: cashAccountId, organizationId, branchId },
    });
    if (!found) {
      throw new BadRequestException(
        `Cash account ${cashAccountId} is not a valid cash fund for branch ${branchId}`,
      );
    }
  }

  /** Resolve a COA account id by code within the org (active accounts only). */
  async resolveCoaAccountIdByCode(
    organizationId: string,
    code: string,
    manager?: EntityManager,
  ): Promise<string> {
    const m = manager ?? this.dataSource.manager;
    const rows = await m.query(
      `SELECT "id" FROM "accounts" WHERE "organization_id" = $1 AND "code" = $2 AND "is_active" = true LIMIT 1`,
      [organizationId, code],
    );
    if (!rows || rows.length === 0) {
      throw new BadRequestException(
        `Account ${code} is not configured in the chart of accounts`,
      );
    }
    return rows[0].id;
  }
}
