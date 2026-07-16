import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DepositAccountStatus,
  ResolveDepositTargetResult,
  TargetFund,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DepositAccountEntity } from './deposit-account.entity';
import { DepositPaymentPolicyEntity } from './deposit-payment-policy.entity';

export interface ResolveDepositTargetInput {
  paymentMethod: string;
  cardType?: string | null;
  /** The COA already resolved onto the payment line (invoice_payments.account_id). */
  resolvedAccountId: string;
  branchId: string;
  /** Invoice/doc date — policies are matched non-retroactively against this (BR-MAP-02). */
  docDate: string;
}

/**
 * FR-02 — decides whether a non-cash payment line flows into a deposit fund, and which one.
 *
 * It does NOT re-map payment_method → account: payment_accounts already does that and the
 * resolved COA is on the payment line. target_fund is DERIVED — a line routes to DEPOSIT iff
 * its COA matches an ACTIVE deposit_accounts.account_id in the same org+branch. deposit_payment_policy
 * only supplies the economics (fee/settlement) and an optional fund override for the ambiguous
 * one-COA↔many-funds case.
 */
@Injectable()
export class DepositRoutingService {
  constructor(
    @InjectRepository(DepositAccountEntity)
    private readonly accounts: Repository<DepositAccountEntity>,
    @InjectRepository(DepositPaymentPolicyEntity)
    private readonly policies: Repository<DepositPaymentPolicyEntity>,
  ) {}

  async resolveDepositTarget(
    input: ResolveDepositTargetInput,
    actor: ActorContext,
  ): Promise<ResolveDepositTargetResult> {
    // 1. COA → ACTIVE deposit funds in the same org+branch.
    const funds = await this.accounts.find({
      where: {
        organizationId: actor.organizationId,
        branchId: input.branchId,
        accountId: input.resolvedAccountId,
        status: DepositAccountStatus.ACTIVE,
      },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    // 2. No deposit fund for this COA → not a deposit line (DF-05 skips auto-post).
    if (funds.length === 0) {
      return { fund: TargetFund.OTHER, feeRate: '0', settlementDays: 0 };
    }

    // 3. Effective policy (branch override > org-wide; card_type match > null; newest effective_from).
    const policy = await this.matchPolicy(input, actor);

    // 4. Single fund → use it; ambiguous COA needs an explicit policy override.
    const depositAccountId =
      funds.length === 1 ? funds[0].id : policy?.depositAccountId ?? null;
    if (!depositAccountId) {
      throw new BadRequestException(
        `Ambiguous deposit COA ${input.resolvedAccountId}: a deposit_payment_policy fund override is required`,
      );
    }

    return {
      fund: TargetFund.DEPOSIT,
      depositAccountId,
      feeRate: policy ? String(policy.feeRate) : '0',
      feeBearer: policy?.feeBearer ?? null,
      settlementDays: policy?.settlementDays ?? 0,
    };
  }

  /**
   * Best matching policy for the line at docDate. Fetch candidates the DB can filter, then
   * rank in RAM (branch override beats org-wide, exact card_type beats null, newest wins) —
   * the boolean-priority ordering does not translate cleanly to SQL.
   */
  private async matchPolicy(
    input: ResolveDepositTargetInput,
    actor: ActorContext,
  ): Promise<DepositPaymentPolicyEntity | null> {
    const rows = await this.policies
      .createQueryBuilder('p')
      .where('p.organizationId = :org', { org: actor.organizationId })
      .andWhere('p.paymentMethod = :pm', { pm: input.paymentMethod })
      .andWhere('p.isActive = true')
      .andWhere('p.effectiveFrom <= :d', { d: input.docDate })
      .andWhere('(p.effectiveTo IS NULL OR :d < p.effectiveTo)', {
        d: input.docDate,
      })
      .andWhere('(p.branchId = :br OR p.branchId IS NULL)', { br: input.branchId })
      .andWhere('(p.cardType = :ct OR p.cardType IS NULL)', {
        ct: input.cardType ?? null,
      })
      .getMany();

    if (rows.length === 0) return null;

    const rank = (p: DepositPaymentPolicyEntity): number =>
      (p.branchId === input.branchId ? 2 : 0) +
      (input.cardType && p.cardType === input.cardType ? 1 : 0);

    rows.sort(
      (a, b) =>
        rank(b) - rank(a) ||
        (b.effectiveFrom > a.effectiveFrom ? 1 : -1),
    );
    return rows[0];
  }
}
