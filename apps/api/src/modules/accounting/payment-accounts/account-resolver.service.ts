import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { AccountEntity } from '../coa/account.entity';
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
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
  ) {}

  /**
   * Resolve the contra (offsetting) COA account for a cash voucher.
   *
   * When `overrideAccountId` is given (e.g. a payment transfer's destination
   * account chosen by the cashier), it is validated to be an active account in the
   * actor's org and returned. Otherwise the account is resolved from `role` via
   * {@link resolveDefaultAccount} (branch override → org default). Callers map the
   * voucher purpose to a role; this method never trusts a client-supplied role.
   */
  async resolveContraAccount(
    role: AccountingDefaultAccountRole,
    actor: ActorContext,
    overrideAccountId?: string,
  ): Promise<string> {
    if (overrideAccountId) {
      const account = await this.accountRepo.findOne({
        where: {
          id: overrideAccountId,
          organizationId: actor.organizationId,
          isActive: true,
        },
      });
      if (!account) {
        throw new BadRequestException(
          `Contra account ${overrideAccountId} not found or inactive for organization ${actor.organizationId}`,
        );
      }
      return account.id;
    }
    return this.resolveDefaultAccount(role, actor);
  }

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
   * Resolve the receiving COA account for a POS payment. Mappings are org-wide
   * (branch_id NULL) by default; a branch override (branch_id = actor.branchId)
   * wins over the org-wide default for the same method.
   *
   * When `paymentAccountId` is given, the client is selecting a specific configured
   * account (e.g. which bank a transfer went into): the mapping is validated to
   * belong to the actor's org, be the org-wide default or the actor's own branch
   * override, be active, and match `method`, then its COA account is returned.
   * Clients never send a COA account id directly — only the whitelisted mapping id.
   *
   * When omitted, it falls back to the single active mapping configured for the
   * method (branch override preferred, else org-wide default). It throws when none
   * is configured, and when more than one exists (the choice is ambiguous — the
   * caller must pass `paymentAccountId`).
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
          isActive: true,
        },
      });
      // Accept the org-wide default (branch_id NULL) or the actor's own branch
      // override; reject another branch's mapping.
      if (!row || (row.branchId && row.branchId !== actor.branchId)) {
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
        paymentMethod: method,
        isActive: true,
      },
      order: { sortOrder: 'ASC' },
    });

    // Branch override wins over org-wide default; both are fetched and the winner
    // is picked in memory rather than relying on SQL NULL ordering.
    const branchRows = rows.filter((r) => r.branchId === actor.branchId);
    const orgRows = rows.filter((r) => !r.branchId);
    const candidates = branchRows.length > 0 ? branchRows : orgRows;

    if (candidates.length === 0) {
      throw new BadRequestException(
        `No payment account configured for method ${method} (branch ${actor.branchId})`,
      );
    }
    if (candidates.length > 1) {
      throw new BadRequestException(
        `Multiple payment accounts configured for method ${method} (branch ${actor.branchId}); a paymentAccountId must be specified`,
      );
    }
    return candidates[0].accountId;
  }
}
