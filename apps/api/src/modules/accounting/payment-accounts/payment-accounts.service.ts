import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PaymentAccountEntity } from './payment-account.entity';
import { PaymentAccountMethod } from './enums';

/**
 * A configured payment account, shaped for client selection at checkout. The COA
 * `accountId` is intentionally NOT exposed: clients reference the mapping by `id`
 * (validated server-side), never the underlying ledger account.
 */
export interface PaymentAccountListItem {
  id: string;
  paymentMethod: PaymentAccountMethod;
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

    return visible.map((r) => ({
      id: r.id,
      paymentMethod: r.paymentMethod,
      bankName: r.bankName ?? null,
      bankCode: r.bankCode ?? null,
      accountNumber: r.accountNumber ?? null,
      label: r.label ?? null,
      sortOrder: r.sortOrder,
    }));
  }
}
