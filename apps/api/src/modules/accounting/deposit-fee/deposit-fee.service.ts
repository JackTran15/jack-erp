import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  DepositMovementSource,
  DepositMovementType,
  FeeBearer,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DepositService } from '../deposit/deposit.service';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { CashFundResolverService } from '../cash/cash-fund-resolver.service';

/**
 * TK 6417 "Chi phí dịch vụ ngân hàng" — contra account for the acquirer-fee
 * expense. Exported so DepositReconService (DFR-02) can reuse the same code
 * for its BR-REC-03 adjustment-proposal contra.
 */
export const BANK_FEE_COA_CODE = '6417';

export const round2 = (v: number): number => Math.round(v * 100) / 100;

export interface ComputedFee {
  feeAmount: number;
  netAmount: number;
}

/**
 * Acquirer transaction-fee handling (R1, TKT-DFR-03, highest risk). The gross
 * deposit movement always books `+amount` (matching the POS invoice revenue,
 * R4/BR-POS-02); the fee is a second WITHDRAWAL leg so the net balance change
 * (`+amount − fee`) matches the bank statement.
 */
@Injectable()
export class DepositFeeService {
  constructor(
    private readonly depositService: DepositService,
    private readonly cashFundResolver: CashFundResolverService,
  ) {}

  /**
   * OQ-01: `feeBearer` decides who absorbs the fee. `CUSTOMER` (or unset —
   * MERCHANT is the default) never touches the merchant's net; `MERCHANT`
   * deducts `round2(amount * feeRate)`.
   */
  computeFee(
    amount: number,
    feeRate: string,
    feeBearer: FeeBearer | null | undefined,
  ): ComputedFee {
    if (feeBearer === FeeBearer.CUSTOMER) {
      return { feeAmount: 0, netAmount: round2(amount) };
    }
    const feeAmount = round2(amount * Number(feeRate));
    return { feeAmount, netAmount: round2(amount - feeAmount) };
  }

  /**
   * Posts the WITHDRAWAL fee leg against an already-created gross movement, in
   * the caller's transaction (the POS auto-post consumer). No-op when
   * `feeAmount` is 0. Not idempotency-checked on its own — the caller only
   * invokes this when the gross movement was newly created (not a replay), and
   * the whole call runs inside the gross movement's transaction, so a
   * concurrent duplicate rolls back both legs together via the gross row's own
   * unique index.
   */
  async postFee(
    gross: DepositMovementEntity,
    feeAmount: number,
    actor: ActorContext,
    manager: EntityManager,
  ): Promise<void> {
    if (feeAmount <= 0) return;
    const contraAccountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
      actor.organizationId,
      BANK_FEE_COA_CODE,
      manager,
    );
    await this.depositService.recordMovement(
      {
        depositAccountId: gross.depositAccountId,
        type: DepositMovementType.WITHDRAWAL,
        amount: feeAmount,
        contraAccountId,
        source: DepositMovementSource.SYSTEM,
        sourceRefId: gross.id,
        sourceRefLineId: 'FEE',
        docDate: gross.docDate,
      },
      actor,
      manager,
    );
  }
}
