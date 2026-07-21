import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashVoucherPartnerType,
} from '../../cash-vouchers/enums';
import { PartnerResolverService } from '../../cash-vouchers/shared/partner-resolver.service';
import {
  resolvePartySnapshot,
  type VoucherPartySnapshot,
} from '../../cash-vouchers/shared/voucher-party';
import { CashPaymentsService } from '../../cash-vouchers/cash-payments/cash-payments.service';
import { CashReceiptsService } from '../../cash-vouchers/cash-receipts/cash-receipts.service';
import {
  BankPaymentPurpose,
  BankPaymentReferenceType,
  BankReceiptPurpose,
  BankReceiptReferenceType,
} from '../enums';
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

/** One leg of a swap, enough for the FE to render a clickable "Tham chiếu". */
export interface FundSwapLeg {
  kind: 'BANK_PAYMENT' | 'BANK_RECEIPT' | 'CASH_PAYMENT' | 'CASH_RECEIPT';
  id: string;
  documentNumber: string | null;
}

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
    private readonly partnerResolver: PartnerResolverService,
  ) {}

  /**
   * Detail lines for the source leg. Falls back to a single synthesized line so
   * callers that send no lines (the standalone "Chuyển quỹ" dialog) behave
   * exactly as before.
   */
  private sourceLines(dto: CreateFundSwapDto, fallbackDescription: string) {
    if (!dto.lines?.length) return undefined;
    return dto.lines.map((l) => ({
      description: l.description || fallbackDescription,
      amount: l.amount,
      categoryId: l.categoryId,
    }));
  }

  /**
   * Counterpart lines clone description + amount but deliberately NOT
   * categoryId: cash_voucher_categories is direction-scoped, so a "Mục chi" id
   * is not a valid "Mục thu".
   */
  private counterpartLines(dto: CreateFundSwapDto, fallbackDescription: string) {
    if (!dto.lines?.length) return undefined;
    return dto.lines.map((l) => ({
      description: l.description || fallbackDescription,
      amount: l.amount,
    }));
  }

  private async party(
    manager: EntityManager,
    dto: CreateFundSwapDto,
    actor: ActorContext,
  ): Promise<VoucherPartySnapshot> {
    return resolvePartySnapshot(
      manager,
      this.partnerResolver,
      {
        partnerType: dto.partnerType as unknown as CashVoucherPartnerType,
        partnerId: dto.partnerId,
        personName: dto.payeeName,
        address: dto.address,
        staffId: dto.paidBy,
        reason: dto.reason,
        reference: dto.reference,
      },
      actor.organizationId,
    );
  }

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

      // One id shared by every leg, so each voucher can find its counterpart
      // ("Tham chiếu") and so createAndPostInternal's findByReference
      // idempotency guard actually has something to match on.
      const swapId = uuidv4();
      const party = await this.party(manager, dto, actor);

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
            referenceType: BankPaymentReferenceType.FUND_SWAP,
            referenceId: swapId,
            partnerType: dto.partnerType,
            partnerId: party.partnerId,
            partnerName: party.partnerName,
            partnerAddress: party.partnerAddress,
            payeeName: party.personName,
            paidBy: party.staffId,
            reference: party.reference,
            reason: dto.reason,
            description: 'Rút tiền gửi chuyển quỹ tiền mặt',
            lines: this.sourceLines(dto, 'Rút tiền gửi chuyển quỹ tiền mặt'),
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
              referenceType: BankPaymentReferenceType.FUND_SWAP,
              referenceId: swapId,
              partnerType: dto.partnerType,
              partnerId: party.partnerId,
              partnerName: party.partnerName,
              partnerAddress: party.partnerAddress,
              payeeName: party.personName,
              paidBy: party.staffId,
              reason: dto.reason,
              description: 'Phí rút tiền gửi',
            },
            manager,
          );
        }

        if (dto.autoCreateReceipt === false) {
          // Leg 2 deliberately skipped — the amount sits in TK 113 "Tiền đang
          // chuyển" until the cashier records it themselves as a separate cash
          // receipt once actually counted. No pending state is tracked here.
          return {
            bankPaymentId: bankPayment.voucherId,
            bankFeePaymentId: bankFeePayment?.voucherId,
          };
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
            referenceType: CashReceiptReferenceType.FUND_SWAP,
            referenceId: swapId,
            partnerType: party.partnerType,
            partnerId: party.partnerId,
            partnerName: party.partnerName,
            partnerAddress: party.partnerAddress,
            payerName: party.personName,
            staffId: party.staffId,
            reason: dto.reason,
            description: 'Nộp từ tiền gửi',
            lines: this.counterpartLines(dto, 'Nộp từ tiền gửi'),
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
          // Not OTHER: the treasury grid and the payment dialog read the purpose
          // back to label the voucher "Chuyển tiền mặt thành tiền gửi".
          purpose: CashPaymentPurpose.DEPOSIT_TRANSFER,
          cashAccountId,
          contraAccountId: clearingAccountId,
          amount: dto.amount,
          actor,
          voucherDate: dto.docDate,
          referenceType: CashPaymentReferenceType.FUND_SWAP,
          referenceId: swapId,
          partnerType: party.partnerType,
          partnerId: party.partnerId,
          partnerName: party.partnerName,
          partnerAddress: party.partnerAddress,
          payeeName: party.personName,
          staffId: party.staffId,
          reason: dto.reason,
          description: 'Nộp tiền mặt vào tiền gửi',
          lines: this.sourceLines(dto, 'Nộp tiền mặt vào tiền gửi'),
        },
        manager,
      );

      if (dto.autoCreateReceipt === false) {
        // Counterpart leg deliberately skipped — the amount sits in TK 113
        // "Tiền đang chuyển" until the bank confirms the deposit and the
        // accountant records it as a separate deposit receipt. Mirrors the
        // DEPOSIT_TO_CASH branch above.
        return { cashPaymentId: cashPayment.voucherId };
      }

      const bankReceipt = await this.bankReceipt.createAndPostInternal(
        {
          purpose: BankReceiptPurpose.OTHER,
          depositAccountId: dto.depositAccountId,
          contraAccountId: clearingAccountId,
          amount: dto.amount,
          actor,
          docDate: dto.docDate,
          affectRevenue: false,
          referenceType: BankReceiptReferenceType.FUND_SWAP,
          referenceId: swapId,
          partnerType: dto.partnerType,
          partnerId: party.partnerId,
          partnerName: party.partnerName,
          partnerAddress: party.partnerAddress,
          payerName: party.personName,
          collectedBy: party.staffId,
          reason: dto.reason,
          description: 'Nộp từ quỹ tiền mặt',
          lines: this.counterpartLines(dto, 'Nộp từ quỹ tiền mặt'),
        },
        manager,
      );

      return {
        cashPaymentId: cashPayment.voucherId,
        bankReceiptId: bankReceipt.voucherId,
      };
    });
  }

  /**
   * Every voucher belonging to one swap, so a leg can link to its counterpart.
   * Org-scoped; branch-scoped too when the actor has a branch, since both legs
   * of a swap always belong to the same branch.
   */
  async legs(swapId: string, actor: ActorContext): Promise<FundSwapLeg[]> {
    const tables: Array<{ table: string; kind: FundSwapLeg['kind'] }> = [
      { table: 'bank_payments', kind: 'BANK_PAYMENT' },
      { table: 'bank_receipts', kind: 'BANK_RECEIPT' },
      { table: 'cash_payments', kind: 'CASH_PAYMENT' },
      { table: 'cash_receipts', kind: 'CASH_RECEIPT' },
    ];

    const params: unknown[] = [swapId, actor.organizationId];
    const branchClause = actor.branchId ? ` AND branch_id = $3` : '';
    if (actor.branchId) params.push(actor.branchId);

    const sql = tables
      .map(
        ({ table, kind }) =>
          `SELECT '${kind}' AS kind, id, document_number AS "documentNumber"
             FROM ${table}
            WHERE reference_type = 'FUND_SWAP'
              AND reference_id = $1
              AND organization_id = $2
              AND deleted_at IS NULL${branchClause}`,
      )
      .join('\n UNION ALL \n');

    return this.dataSource.query<FundSwapLeg[]>(sql, params);
  }
}
