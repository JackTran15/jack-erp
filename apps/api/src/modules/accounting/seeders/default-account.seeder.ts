import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AccountEntity } from '../coa/account.entity';
import { AccountingDefaultAccountEntity } from '../payment-accounts/accounting-default-account.entity';
import { AccountingDefaultAccountRole } from '../payment-accounts/enums';

/**
 * Org-default COA account per role, resolved server-side by sale/cash posting and
 * by manual cash-voucher posting. Codes follow the default Vietnamese COA seeded
 * by {@link CoaSeederService} (TT200). Receipts/payments resolve their contra
 * account from the voucher purpose, which maps onto these roles.
 */
const ROLE_TO_CODE: Record<AccountingDefaultAccountRole, string> = {
  [AccountingDefaultAccountRole.REVENUE]: '511',
  [AccountingDefaultAccountRole.RECEIVABLE]: '131',
  [AccountingDefaultAccountRole.OTHER_INCOME]: '711',
  [AccountingDefaultAccountRole.PAYABLE]: '331',
  [AccountingDefaultAccountRole.EXPENSE]: '642',
};

/**
 * Seeds the org-wide (branch_id NULL) default-account row for each role, mapping
 * it to the COA account with the configured code. Insert-if-missing per role, so
 * re-running is idempotent and never overwrites a manually-configured default.
 */
@Injectable()
export class DefaultAccountSeederService {
  private readonly logger = new Logger(DefaultAccountSeederService.name);

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
    @InjectRepository(AccountingDefaultAccountEntity)
    private readonly defaultAccountRepo: Repository<AccountingDefaultAccountEntity>,
  ) {}

  async seedForOrganization(
    organizationId: string,
    actorId: string,
  ): Promise<number> {
    let inserted = 0;
    for (const role of Object.values(AccountingDefaultAccountRole)) {
      const existing = await this.defaultAccountRepo.findOne({
        where: { organizationId, accountRole: role, branchId: IsNull() },
      });
      if (existing) continue;

      const code = ROLE_TO_CODE[role];
      const account = await this.accountRepo.findOne({
        where: { organizationId, code },
      });
      if (!account) {
        this.logger.warn(
          `No COA account ${code} for org ${organizationId} — skipping default ${role}`,
        );
        continue;
      }

      await this.defaultAccountRepo.save(
        this.defaultAccountRepo.create({
          organizationId,
          branchId: undefined,
          accountRole: role,
          accountId: account.id,
          createdBy: actorId,
        }),
      );
      inserted += 1;
    }

    if (inserted > 0) {
      this.logger.log(
        `Seeded ${inserted} default-account role(s) for organization ${organizationId}`,
      );
    }
    return inserted;
  }
}
