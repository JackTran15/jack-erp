import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PaymentAccountEntity } from './payment-account.entity';
import { AccountingDefaultAccountEntity } from './accounting-default-account.entity';
import { AccountingDefaultAccountRole, PaymentAccountMethod } from './enums';

/**
 * Resolves COA accounts (accounts.id) server-side from configuration, so callers
 * never trust client-supplied account IDs. Sale/cash posting reads its accounts
 * from here:
 *   - {@link resolveDefaultAccount} for role accounts (REVENUE / RECEIVABLE)
 *   - {@link resolvePaymentAccount} for the receiving account of a payment method
 */
@Injectable()
export class AccountResolverService {
  constructor(
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccountRepo: Repository<PaymentAccountEntity>,
    @InjectRepository(AccountingDefaultAccountEntity)
    private readonly defaultAccountRepo: Repository<AccountingDefaultAccountEntity>,
  ) {}

  /**
   * Resolve the default COA account for a role. A branch override
   * (branch_id = actor.branchId) wins over the org default (branch_id NULL);
   * throws when neither is configured. Both candidate rows are fetched and the
   * winner is picked in memory rather than relying on SQL NULL ordering.
   */
  async resolveDefaultAccount(
    role: AccountingDefaultAccountRole,
    actor: ActorContext,
  ): Promise<string> {
    const rows = await this.defaultAccountRepo.find({
      where: { organizationId: actor.organizationId, accountRole: role },
    });

    const branchRow = actor.branchId
      ? rows.find((r) => r.branchId === actor.branchId)
      : undefined;
    const orgRow = rows.find((r) => !r.branchId);
    const resolved = branchRow ?? orgRow;

    if (!resolved) {
      throw new BadRequestException(
        `No default ${role} account configured for organization ${actor.organizationId}`,
      );
    }
    return resolved.accountId;
  }

  /**
   * Resolve the receiving COA account for a POS payment, scoped to the actor's
   * branch.
   *
   * When `paymentAccountId` is given, the client is selecting a specific configured
   * account (e.g. which bank a transfer went into): the mapping is validated to
   * belong to the actor's org + branch, be active, and match `method`, then its COA
   * account is returned. Clients never send a COA account id directly — only the
   * whitelisted mapping id.
   *
   * When omitted, it falls back to the single active mapping configured for the
   * method. It throws when none is configured, and when more than one exists (the
   * choice is ambiguous — the caller must pass `paymentAccountId`).
   */
  async resolvePaymentAccount(
    method: PaymentAccountMethod,
    actor: ActorContext,
    paymentAccountId?: string,
  ): Promise<string> {
    if (!actor.branchId) {
      throw new BadRequestException(
        'Branch scope is required to resolve a payment account',
      );
    }

    if (paymentAccountId) {
      const row = await this.paymentAccountRepo.findOne({
        where: {
          id: paymentAccountId,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          isActive: true,
        },
      });
      if (!row) {
        throw new BadRequestException(
          `Payment account ${paymentAccountId} not found for branch ${actor.branchId}`,
        );
      }
      if (row.paymentMethod !== method) {
        throw new BadRequestException(
          `Payment account ${paymentAccountId} is not configured for method ${method}`,
        );
      }
      return row.accountId;
    }

    const rows = await this.paymentAccountRepo.find({
      where: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        paymentMethod: method,
        isActive: true,
      },
      order: { sortOrder: 'ASC' },
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        `No payment account configured for method ${method} (branch ${actor.branchId})`,
      );
    }
    if (rows.length > 1) {
      throw new BadRequestException(
        `Multiple payment accounts configured for method ${method} (branch ${actor.branchId}); a paymentAccountId must be specified`,
      );
    }
    return rows[0].accountId;
  }
}
