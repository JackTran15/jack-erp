import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { CashPaymentPurpose, CashReceiptPurpose } from '../../cash-vouchers/enums';
import { CashPaymentsService } from '../../cash-vouchers/cash-payments/cash-payments.service';
import { CashReceiptsService } from '../../cash-vouchers/cash-receipts/cash-receipts.service';
import { BankPaymentPurpose, BankReceiptPurpose } from '../enums';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import { BankReceiptsService } from '../bank-receipts/bank-receipts.service';
import { CreateFundSwapDto, FundSwapDirection } from './dto/create-fund-swap.dto';

/**
 * TK 113 "Tiền đang chuyển" — clearing account for a same-branch fund swap. Each
 * leg posts its own balanced journal entry against 113 (not against the
 * counterparty's real 111x/112x account); since both legs run in the same ACID
 * transaction, 113 nets to zero immediately and neither account's GL balance is
 * double-booked. GĐ4 inter-branch transfers reuse the same clearing account for
 * their (non-atomic) money-in-transit leg.
 */
const CLEARING_ACCOUNT_CODE = '113';

export interface FundSwapResult {
  bankPaymentId?: string;
  bankFeePaymentId?: string;
  cashReceiptId?: string;
  cashPaymentId?: string;
  bankReceiptId?: string;
}

/**
 * FR-08: move money between the cash fund and the deposit fund of the same
 * branch, both legs in one ACID transaction (BR-SWP-01). Composes the existing
 * cash/deposit voucher `createAndPostInternal` methods under one `EntityManager`.
 */
@Injectable()
export class FundSwapsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly bankPayment: BankPaymentsService,
    private readonly bankReceipt: BankReceiptsService,
    private readonly cashPayment: CashPaymentsService,
    private readonly cashReceipt: CashReceiptsService,
    private readonly cashFundResolver: CashFundResolverService,
    private readonly accountResolver: AccountResolverService,
  ) {}

  async swap(dto: CreateFundSwapDto, actor: ActorContext): Promise<FundSwapResult> {
    return this.dataSource.transaction(async (manager) => {
      const clearingAccountId = await this.cashFundResolver.resolveCoaAccountIdByCode(
        actor.organizationId,
        CLEARING_ACCOUNT_CODE,
        manager,
      );
      const cashAccountId = await this.cashFundResolver.resolveOrDefault(
        actor.organizationId,
        actor.branchId,
        dto.cashAccountId,
        manager,
      );

      if (dto.direction === FundSwapDirection.DEPOSIT_TO_CASH) {
        // Leg 1 — withdraw the base amount from the deposit fund (BR-SWP-02: never
        // an expense; CASH_TRANSFER is a fund-move purpose so this is forced
        // regardless of input).
        const bankPayment = await this.bankPayment.createAndPostInternal(
          {
            purpose: BankPaymentPurpose.CASH_TRANSFER,
            depositAccountId: dto.depositAccountId,
            contraAccountId: clearingAccountId,
            amount: dto.amount,
            actor,
            docDate: dto.docDate,
            affectExpense: false,
            reason: dto.reason,
            description: 'Rút tiền gửi chuyển quỹ tiền mặt',
          },
          manager,
        );

        // Leg 1b (BR-SWP-03) — the withdrawal fee is its own expense entry against
        // the deposit fund; the cash leg still receives the full `amount`.
        let bankFeePayment: { voucherId: string } | undefined;
        if (dto.feeAmount) {
          const feeContraAccountId = await this.accountResolver.resolveContraAccount(
            AccountingDefaultAccountRole.EXPENSE,
            actor,
          );
          bankFeePayment = await this.bankPayment.createAndPostInternal(
            {
              purpose: BankPaymentPurpose.BANK_FEE,
              depositAccountId: dto.depositAccountId,
              contraAccountId: feeContraAccountId,
              amount: dto.feeAmount,
              actor,
              docDate: dto.docDate,
              affectExpense: true,
              reason: dto.reason,
              description: 'Phí rút tiền gửi',
            },
            manager,
          );
        }

        // Leg 2 — deposit the same base amount into the branch cash fund.
        const cashReceipt = await this.cashReceipt.createAndPostInternal(
          {
            purpose: CashReceiptPurpose.OTHER,
            cashAccountId,
            contraAccountId: clearingAccountId,
            amount: dto.amount,
            actor,
            voucherDate: dto.docDate,
            reason: dto.reason,
            description: 'Nộp từ tiền gửi',
          },
          manager,
        );

        return {
          bankPaymentId: bankPayment.voucherId,
          bankFeePaymentId: bankFeePayment?.voucherId,
          cashReceiptId: cashReceipt.voucherId,
        };
      }

      // CASH_TO_DEPOSIT: withdraw cash → deposit into the bank/e-wallet account.
      const cashPayment = await this.cashPayment.createAndPostInternal(
        {
          purpose: CashPaymentPurpose.OTHER,
          cashAccountId,
          contraAccountId: clearingAccountId,
          amount: dto.amount,
          actor,
          voucherDate: dto.docDate,
          reason: dto.reason,
          description: 'Nộp tiền mặt vào tiền gửi',
        },
        manager,
      );
      const bankReceipt = await this.bankReceipt.createAndPostInternal(
        {
          purpose: BankReceiptPurpose.OTHER,
          depositAccountId: dto.depositAccountId,
          contraAccountId: clearingAccountId,
          amount: dto.amount,
          actor,
          docDate: dto.docDate,
          affectRevenue: false,
          reason: dto.reason,
          description: 'Nộp từ quỹ tiền mặt',
        },
        manager,
      );

      return {
        cashPaymentId: cashPayment.voucherId,
        bankReceiptId: bankReceipt.voucherId,
      };
    });
  }
}
