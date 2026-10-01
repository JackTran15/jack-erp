import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import type { CashFundDocumentKind } from '@erp/shared-interfaces';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { CashPaymentEntity } from '../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashPaymentLineEntity } from '../../accounting/cash-vouchers/cash-payments/cash-payment-line.entity';
import { CashReceiptEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashReceiptLineEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt-line.entity';
import { CashVoucherCategoryEntity } from '../../accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';
import {
  CashPaymentReferenceType,
  CashReceiptReferenceType,
  CashVoucherCategoryDirection,
  CashVoucherStatus,
} from '../../accounting/cash-vouchers/enums';
import { BankPaymentEntity } from '../../accounting/deposit-vouchers/bank-payments/bank-payment.entity';
import { BankPaymentLineEntity } from '../../accounting/deposit-vouchers/bank-payments/bank-payment-line.entity';
import { BankReceiptEntity } from '../../accounting/deposit-vouchers/bank-receipts/bank-receipt.entity';
import { BankReceiptLineEntity } from '../../accounting/deposit-vouchers/bank-receipts/bank-receipt-line.entity';
import {
  BankPaymentReferenceType,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../../accounting/deposit-vouchers/enums';
import { InvoiceItemEntity } from '../../pos/entities/invoice-item.entity';
import { InvoiceEntity } from '../../pos/entities/invoice.entity';
import { applyBranchScope, applyInvoiceStatusFilter } from '../report-core/report-query.util';

/** Sentinel category id for lines with no category ("Thu khác"/"Chi khác"). */
export const BUSINESS_RESULTS_UNCATEGORIZED = 'uncategorized';

export interface BusinessResultsScope {
  organizationId: string;
  branchIds: string[] | null;
  /** Calendar date YYYY-MM-DD (or an ISO instant whose first 10 chars are one). */
  from: string;
  to: string;
}

/** "Thu khác" (2.2) reads receipts; "Chi phí khác" (3.2) reads payments. */
export type OtherLineDirection = 'in' | 'out';

export const VOUCHER_KINDS_BY_DIRECTION: Record<OtherLineDirection, CashFundDocumentKind[]> = {
  in: ['CASH_RECEIPT', 'BANK_RECEIPT'],
  out: ['CASH_PAYMENT', 'BANK_PAYMENT'],
};

/**
 * The exact row sets "Kết quả kinh doanh" sums, as query builders, so the
 * statement and its drill-down lists can never disagree on what a cell holds.
 *
 * Voucher builders use aliases `line` (voucher line), `voucher` (header) and
 * `category` (left-joined cash voucher category) whatever the voucher kind.
 */
@Injectable()
export class BusinessResultsSource {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly lineItems: Repository<InvoiceItemEntity>,
    @InjectRepository(CashPaymentLineEntity)
    private readonly cashPaymentLines: Repository<CashPaymentLineEntity>,
    @InjectRepository(CashReceiptLineEntity)
    private readonly cashReceiptLines: Repository<CashReceiptLineEntity>,
    @InjectRepository(BankReceiptLineEntity)
    private readonly bankReceiptLines: Repository<BankReceiptLineEntity>,
    @InjectRepository(BankPaymentLineEntity)
    private readonly bankPaymentLines: Repository<BankPaymentLineEntity>,
  ) {}

  /** Non-cancelled invoices issued in the period (alias `invoice`). */
  invoiceQuery(scope: BusinessResultsScope): SelectQueryBuilder<InvoiceEntity> {
    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: scope.organizationId });
    this.scopeInvoices(qb, scope);
    return qb;
  }

  /** Lines of those invoices (aliases `li`, `invoice`). */
  invoiceLineQuery(scope: BusinessResultsScope): SelectQueryBuilder<InvoiceItemEntity> {
    const qb = this.lineItems
      .createQueryBuilder('li')
      .innerJoin(InvoiceEntity, 'invoice', 'invoice.id = li.invoiceId')
      .where('invoice.organizationId = :orgId', { orgId: scope.organizationId });
    this.scopeInvoices(qb, scope);
    return qb;
  }

  private scopeInvoices<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    scope: BusinessResultsScope,
  ): void {
    applyBranchScope(qb, 'invoice', scope.branchIds);
    applyInvoiceStatusFilter(qb, 'invoice', {});
    new FilterBuilder(qb).applyDateRange('invoice.issuedAt', {
      from: scope.from,
      to: scope.to,
    });
  }

  /**
   * Voucher lines of one kind that count as "Thu khác"/"Chi phí khác": POSTED,
   * dated in the period, line category (if any) of the matching direction, and
   * not a voucher whose money is already recognised elsewhere in the P&L.
   *
   * Cash payments drop REFUND (the return invoice already hits 2.1.1.b/3.1.2),
   * GOODS_RECEIPT and INVOICE_DEBT (inventory/AP, not expense) and REVERSAL (a
   * reversal copies the original's lines as POSTED while the original flips to
   * REVERSED, so counting it re-adds what it cancelled). Cash receipts drop
   * INVOICE (POS sale, already in 2.1.1), INVOICE_DEBT/RECEIVABLE (AR turning
   * into cash), REVERSAL and RETURN_CANCEL (cash taken back when a return is
   * cancelled — the cancelled return already leaves 2.1.1.b, so counting the
   * receipt too adds the sale twice). Deposit vouchers are gated on their own
   * affectRevenue/affectExpense P&L flag, plus REVERSAL (and RETURN_CANCEL on
   * receipts).
   */
  voucherLineQuery(
    kind: CashFundDocumentKind,
    scope: BusinessResultsScope,
  ): SelectQueryBuilder<ObjectLiteral> {
    const qb = this.voucherLineBase(kind);
    qb.where('voucher.organizationId = :orgId', { orgId: scope.organizationId });
    applyBranchScope(qb, 'voucher', scope.branchIds);
    qb.andWhere(`voucher.${dateColumn(kind)} >= :voucherFrom`, {
      voucherFrom: scope.from.slice(0, 10),
    }).andWhere(`voucher.${dateColumn(kind)} <= :voucherTo`, {
      voucherTo: scope.to.slice(0, 10),
    });
    qb.andWhere('(line.categoryId IS NULL OR category.direction = :categoryDirection)', {
      categoryDirection: isIncome(kind)
        ? CashVoucherCategoryDirection.IN
        : CashVoucherCategoryDirection.OUT,
    });

    switch (kind) {
      case 'CASH_PAYMENT':
        qb.andWhere('voucher.status = :status', { status: CashVoucherStatus.POSTED }).andWhere(
          '(voucher.referenceType IS NULL OR voucher.referenceType NOT IN (:...excludedRefTypes))',
          {
            excludedRefTypes: [
              CashPaymentReferenceType.REFUND,
              CashPaymentReferenceType.GOODS_RECEIPT,
              CashPaymentReferenceType.INVOICE_DEBT,
              CashPaymentReferenceType.REVERSAL,
            ],
          },
        );
        break;
      case 'CASH_RECEIPT':
        qb.andWhere('voucher.status = :status', { status: CashVoucherStatus.POSTED }).andWhere(
          '(voucher.referenceType IS NULL OR voucher.referenceType NOT IN (:...excludedRefTypes))',
          {
            excludedRefTypes: [
              CashReceiptReferenceType.INVOICE,
              CashReceiptReferenceType.INVOICE_DEBT,
              CashReceiptReferenceType.RECEIVABLE,
              CashReceiptReferenceType.REVERSAL,
              CashReceiptReferenceType.RETURN_CANCEL,
            ],
          },
        );
        break;
      case 'BANK_RECEIPT':
        qb.andWhere('voucher.status = :status', { status: BankVoucherStatus.POSTED })
          .andWhere('voucher.affectRevenue = true')
          .andWhere(
            '(voucher.referenceType IS NULL OR voucher.referenceType NOT IN (:...excludedRefTypes))',
            {
              excludedRefTypes: [
                BankReceiptReferenceType.REVERSAL,
                BankReceiptReferenceType.RETURN_CANCEL,
              ],
            },
          );
        break;
      case 'BANK_PAYMENT':
        qb.andWhere('voucher.status = :status', { status: BankVoucherStatus.POSTED })
          .andWhere('voucher.affectExpense = true')
          .andWhere('(voucher.referenceType IS NULL OR voucher.referenceType != :reversal)', {
            reversal: BankPaymentReferenceType.REVERSAL,
          });
        break;
    }
    return qb;
  }

  private voucherLineBase(kind: CashFundDocumentKind): SelectQueryBuilder<ObjectLiteral> {
    const withCategory = <T extends ObjectLiteral>(qb: SelectQueryBuilder<T>) =>
      qb.leftJoin(CashVoucherCategoryEntity, 'category', 'category.id = line.categoryId');
    switch (kind) {
      case 'CASH_PAYMENT':
        return withCategory(
          this.cashPaymentLines
            .createQueryBuilder('line')
            .innerJoin(CashPaymentEntity, 'voucher', 'voucher.id = line.cashPaymentId'),
        );
      case 'CASH_RECEIPT':
        return withCategory(
          this.cashReceiptLines
            .createQueryBuilder('line')
            .innerJoin(CashReceiptEntity, 'voucher', 'voucher.id = line.cashReceiptId'),
        );
      case 'BANK_RECEIPT':
        return withCategory(
          this.bankReceiptLines
            .createQueryBuilder('line')
            .innerJoin(BankReceiptEntity, 'voucher', 'voucher.id = line.bankReceiptId'),
        );
      case 'BANK_PAYMENT':
        return withCategory(
          this.bankPaymentLines
            .createQueryBuilder('line')
            .innerJoin(BankPaymentEntity, 'voucher', 'voucher.id = line.bankPaymentId'),
        );
    }
  }
}

/** "Ngày thu/chi": voucher_date on cash vouchers, doc_date on deposit vouchers (both plain `date`). */
export function dateColumn(kind: CashFundDocumentKind): 'voucherDate' | 'docDate' {
  return kind === 'CASH_PAYMENT' || kind === 'CASH_RECEIPT' ? 'voucherDate' : 'docDate';
}

export function isIncome(kind: CashFundDocumentKind): boolean {
  return kind === 'CASH_RECEIPT' || kind === 'BANK_RECEIPT';
}

/** Restrict a voucher line query to one category id, or to lines with none. */
export function applyCategoryFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  categoryId: string | undefined,
): void {
  if (!categoryId) return;
  if (categoryId === BUSINESS_RESULTS_UNCATEGORIZED) {
    qb.andWhere('line.categoryId IS NULL');
  } else {
    qb.andWhere('line.categoryId = :lineCategoryId', { lineCategoryId: categoryId });
  }
}
