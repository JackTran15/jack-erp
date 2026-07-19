import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { PaymentAccountEntity } from './payment-account.entity';
import { PaymentAccountMethod } from './enums';

/**
 * A configured payment account, shaped for client selection at checkout. The COA
 * `accountId` is intentionally NOT exposed: clients reference the mapping by `id`
 * (validated server-side), never the underlying ledger account. Bank display fields
 * are joined in from the linked deposit fund (null for cash / a mapping with no
 * deposit fund linked) — `payment_accounts` itself carries no bank data of its own.
 */
export interface PaymentAccountListItem {
  id: string;
  paymentMethod: PaymentAccountMethod;
  /**
   * Display name of the linked deposit fund. The POS shows the payment method
   * and the receiving account in two separate selects, so the account select
   * needs the fund's own identity ("Lam Hoang An") rather than the mapping's
   * free-text `label`, which typically just repeats the method.
   */
  depositAccountName: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  label: string | null;
  sortOrder: number;
}

@Injectable()
export class PaymentAccountsService {
  constructor(
    @InjectRepository(PaymentAccountEntity)
    private readonly repo: Repository<PaymentAccountEntity>,
    @InjectRepository(DepositAccountEntity)
    private readonly depositAccountRepo: Repository<DepositAccountEntity>,
  ) {}

  /**
   * List the active payment accounts the actor's branch can pick at checkout, so the
   * POS can let the cashier choose which bank/card account a payment goes into.
   * Mappings are org-wide (branch_id NULL) unless the branch has its own override,
   * which then hides the org-wide default for that method. Optionally filtered to a
   * single method; ordered by `sortOrder` for a stable UI.
   */
  async list(
    actor: ActorContext,
    method?: PaymentAccountMethod,
  ): Promise<PaymentAccountListItem[]> {
    if (!actor.branchId) {
      throw new BadRequestException(
        'Branch scope is required to list payment accounts',
      );
    }

    const where: FindOptionsWhere<PaymentAccountEntity> = {
      organizationId: actor.organizationId,
      isActive: true,
    };
    if (method) {
      where.paymentMethod = method;
    }

    const rows = await this.repo.find({ where, order: { sortOrder: 'ASC' } });

    // Keep the org-wide defaults and this branch's overrides; drop other branches'
    // overrides, and hide an org-wide default for any method this branch overrides.
    const scoped = rows.filter(
      (r) => !r.branchId || r.branchId === actor.branchId,
    );
    const overriddenMethods = new Set(
      scoped.filter((r) => r.branchId).map((r) => r.paymentMethod),
    );
    const visible = scoped.filter(
      (r) => r.branchId || !overriddenMethods.has(r.paymentMethod),
    );

    const depositAccountIds = [
      ...new Set(visible.map((r) => r.depositAccountId).filter((id): id is string => Boolean(id))),
    ];
    const depositAccounts = depositAccountIds.length
      ? await this.depositAccountRepo.find({
          where: { id: In(depositAccountIds) },
          relations: ['bank'],
        })
      : [];
    const depositAccountById = new Map(depositAccounts.map((d) => [d.id, d]));

    return visible.map((r) => {
      const deposit = r.depositAccountId ? depositAccountById.get(r.depositAccountId) : undefined;
      return {
        id: r.id,
        paymentMethod: r.paymentMethod,
        depositAccountName: deposit?.name ?? null,
        bankName: deposit?.bank?.name ?? null,
        bankCode: deposit?.bank?.code ?? null,
        accountNumber: deposit?.accountNo ?? null,
        label: r.label ?? null,
        sortOrder: r.sortOrder,
      };
    });
  }
}
