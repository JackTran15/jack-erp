import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CashAccountEntity, CashAccountType } from './cash-account.entity';
import { CashFundResolverService } from './cash-fund-resolver.service';

/** COA code of the cash-on-hand account every branch fund maps to. */
const CASH_COA_CODE = '1111';

/**
 * Provisions the single cash fund for a branch (one-fund-per-branch model).
 * Idempotent: a branch that already has a fund is left untouched. Used by branch
 * creation and the backfill migration.
 */
@Injectable()
export class BranchCashProvisioningService {
  private readonly logger = new Logger(BranchCashProvisioningService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cashFundResolver: CashFundResolverService,
  ) {}

  /**
   * Ensure the branch has exactly one cash fund mapped to COA 1111. Returns the
   * fund id. Throws if COA 1111 is not configured for the org (caller decides
   * whether that is fatal).
   */
  async ensureBranchCashFund(
    organizationId: string,
    branchId: string,
    branchName: string,
    actorId: string,
    manager?: EntityManager,
  ): Promise<string> {
    const repo = (manager ?? this.dataSource.manager).getRepository(
      CashAccountEntity,
    );

    const existing = await repo.findOne({
      where: { organizationId, branchId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (existing) {
      return existing.id;
    }

    const accountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
      organizationId,
      CASH_COA_CODE,
      manager,
    );

    const created = await repo.save(
      repo.create({
        organizationId,
        branchId,
        name: `Quỹ tiền mặt - ${branchName}`,
        type: CashAccountType.REGISTER,
        balance: 0,
        accountId,
        createdBy: actorId,
      }),
    );
    this.logger.log(
      `Provisioned cash fund ${created.id} for branch ${branchId} (org ${organizationId})`,
    );
    return created.id;
  }
}
