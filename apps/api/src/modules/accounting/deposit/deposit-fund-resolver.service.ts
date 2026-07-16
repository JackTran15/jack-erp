import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepositAccountStatus } from '@erp/shared-interfaces';
import { DepositAccountEntity } from './deposit-account.entity';

/**
 * Resolves a branch's deposit fund accounts. Unlike the cash fund (one per branch),
 * a branch can hold several deposit accounts (bank / e-wallet / POS merchant); exactly
 * one is flagged is_default (BR-ACC-03) as the fallback receiving account.
 */
@Injectable()
export class DepositFundResolverService {
  constructor(
    @InjectRepository(DepositAccountEntity)
    private readonly repo: Repository<DepositAccountEntity>,
  ) {}

  /** The branch's default (is_default, ACTIVE) deposit account. Throws when none exists. */
  async resolveBranchDefaultAccount(
    organizationId: string,
    branchId: string | undefined,
  ): Promise<DepositAccountEntity> {
    if (!branchId) {
      throw new BadRequestException(
        'Branch scope is required to resolve the deposit fund',
      );
    }
    const acc = await this.repo.findOne({
      where: {
        organizationId,
        branchId,
        isDefault: true,
        status: DepositAccountStatus.ACTIVE,
      },
    });
    if (!acc) {
      throw new NotFoundException(
        `No default deposit account configured for branch ${branchId}`,
      );
    }
    return acc;
  }

  /**
   * ACTIVE deposit accounts of the org+branch whose COA (account_id) equals the given
   * resolved COA. Used to derive the deposit fund for a non-cash payment line (TKT-DF-04).
   */
  async findAccountsByCoa(
    organizationId: string,
    branchId: string,
    coaAccountId: string,
  ): Promise<DepositAccountEntity[]> {
    return this.repo.find({
      where: {
        organizationId,
        branchId,
        accountId: coaAccountId,
        status: DepositAccountStatus.ACTIVE,
      },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }
}
