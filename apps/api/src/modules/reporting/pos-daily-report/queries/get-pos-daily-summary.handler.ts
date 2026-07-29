import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PosDailySummaryResult } from '@erp/shared-interfaces';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceType,
  RefundMethod,
} from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity, ItemDirection } from '../../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoiceDebtEntity, DebtDocumentType } from '../../../pos/entities/invoice-debt.entity';
import { DebtPaymentEntity } from '../../../pos/entities/debt-payment.entity';
import { InvoicePromotionEntity } from '../../../promotion/invoice-promotion.entity';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashReceiptPurpose, CashVoucherStatus } from '../../../accounting/cash-vouchers/enums';
import { PaymentAccountEntity } from '../../../accounting/payment-accounts/payment-account.entity';
import { PaymentAccountMethod } from '../../../accounting/payment-accounts/enums';
import { RbacService } from '../../../rbac/rbac.service';
import {
  applyBranchScope,
  applyInvoiceStatusFilter,
  CONSOLIDATED_PERMISSION,
  invoiceTypeSign,
  resolveBranchIds,
} from '../../report-core/report-query.util';
import { GetPosDailySummaryQuery } from './get-pos-daily-summary.query';

const VOUCHER_PROMOTION = 'voucher';
const round2 = (n: number): number => Math.round(n * 100) / 100;
const dateOnly = (iso?: string): string | undefined =>
  iso ? iso.slice(0, 10) : undefined;

/**
 * Aggregates the POS daily summary for one time window. Follows the invoice-report
 * conventions (org + branch scope, status filter, sign returns by type) but returns
 * a heterogeneous summary object rather than a columnar `ReportRow[]`.
 *
 * Money model (mirrors "Tổng hợp bán hàng theo ngày" for revenue):
 * - Revenue (Thu) = invoice payments by method + voucher (invoice_promotions) + points
 *   (pointsDiscountAmount), each signed by invoice type, PLUS non-invoice cash inflow
 *   posted as "Phiếu thu" (cash_receipts) — debt collected in cash/transfer (Thu nợ,
 *   `purpose = DEBT_COLLECTION`) and any other misc receipt (Thu khác), excluding
 *   `POS_SALE`-purpose receipts to avoid double-counting a cash sale already counted
 *   via invoice_payments. Returns collect no payment, so their invoice_payments
 *   contribution is naturally empty. Cash refunds are captured on the invoice header
 *   (refundMethod + refundedAmount), never as an invoice_payments row and not reliably
 *   as a cash-payment voucher either — so a CASH-method refund's refundedAmount is
 *   netted directly out of revenue.cash, mirroring daily-sales-summary.report.ts's
 *   cashRefund/refundInputs handling. Debt collected in cash also feeds `debt.debtCollected`
 *   separately — same event, two lenses (cash inflow vs. debt reduction), not a double count.
 * - Expense (Chi) = posted cash-payment vouchers in the window, split into cash /
 *   bank-transfer by the payment-account method of the source fund account.
 */
@QueryHandler(GetPosDailySummaryQuery)
export class GetPosDailySummaryHandler
  implements IQueryHandler<GetPosDailySummaryQuery>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly invoiceItems: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoicePaymentEntity)
    private readonly payments: Repository<InvoicePaymentEntity>,
    @InjectRepository(InvoicePromotionEntity)
    private readonly promotions: Repository<InvoicePromotionEntity>,
    @InjectRepository(InvoiceDebtEntity)
    private readonly invoiceDebts: Repository<InvoiceDebtEntity>,
    @InjectRepository(DebtPaymentEntity)
    private readonly debtPayments: Repository<DebtPaymentEntity>,
    @InjectRepository(CashPaymentEntity)
    private readonly cashPayments: Repository<CashPaymentEntity>,
    @InjectRepository(CashReceiptEntity)
    private readonly cashReceipts: Repository<CashReceiptEntity>,
    @InjectRepository(PaymentAccountEntity)
    private readonly paymentAccounts: Repository<PaymentAccountEntity>,
    private readonly rbac: RbacService,
  ) {}

  async execute({
    dto,
    actor,
  }: GetPosDailySummaryQuery): Promise<PosDailySummaryResult> {
    const org = actor.organizationId;
    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      org,
      CONSOLIDATED_PERMISSION,
    );
    // pos-web has no "Cửa hàng" (store) filter UI — unlike the backoffice reports
    // that call `resolveBranchIds`, there's no way for the user to express "Tất
    // cả chi nhánh". So a consolidated-permission actor must still default to
    // whichever branch is currently active (X-Branch-Id), not every branch in
    // the org; `resolveBranchIds`'s own "no request = null (all)" default only
    // makes sense where the caller *can* ask for "all" explicitly.
    const branchIds = resolveBranchIds(
      hasConsolidated,
      undefined,
      dto.branchId ?? actor.branchId,
      actor,
    );

    // ── Invoices in window (drives revenue / goods / other) ────────────────────
    const invoiceQb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :org', { org });
    applyBranchScope(invoiceQb, 'invoice', branchIds);
    applyInvoiceStatusFilter(invoiceQb, 'invoice', {
      invoiceStatus: dto.invoiceStatus,
    });
    new FilterBuilder(invoiceQb).applyDateRange('invoice.issuedAt', dto.issuedAt);
    if (dto.cashierId) {
      invoiceQb.andWhere('invoice.staffId = :cashier', { cashier: dto.cashierId });
    }
    if (dto.salespersonId) {
      invoiceQb.andWhere('invoice.salespersonId = :sp', { sp: dto.salespersonId });
    }
    const invoices = await invoiceQb.getMany();

    const signByInvoice = new Map<string, number>();
    let points = 0;
    const other = {
      totalInvoices: invoices.length,
      saleInvoices: 0,
      returnInvoices: 0,
      exchangeInvoices: 0,
      voucherCount: 0,
      promoCodeCount: 0, // TODO: define promo-code count backing; 0 until then.
      cardReceiptCount: 0,
    };
    for (const inv of invoices) {
      const sign = invoiceTypeSign(inv.type);
      signByInvoice.set(inv.id, sign);
      points += sign * Number(inv.pointsDiscountAmount ?? 0);
      if (inv.type === InvoiceType.SALE) other.saleInvoices += 1;
      else if (inv.type === InvoiceType.RETURN) other.returnInvoices += 1;
      else if (inv.type === InvoiceType.EXCHANGE) other.exchangeInvoices += 1;
    }
    const invoiceIds = invoices.map((i) => i.id);

    // ── Shared lookups: fund-account method map + date/staff bounds ────────────
    // Used by both Revenue (cash-receipt vouchers) and Expense (cash-payment
    // vouchers) to classify a voucher's fund account as cash vs bank-transfer.
    const accountMethod = new Map<string, PaymentAccountMethod>();
    const accounts = await this.paymentAccounts.find({ where: { organizationId: org } });
    for (const a of accounts) accountMethod.set(a.accountId, a.paymentMethod);
    const from = dateOnly(dto.issuedAt?.from);
    const to = dateOnly(dto.issuedAt?.to);
    // cash_payments/cash_receipts have one staff reference (whoever recorded the
    // voucher), not separate cashier/salesperson roles like invoices — match it
    // against either filter when set, so Thu/Chi still narrow when only one
    // filter is chosen.
    const voucherStaffIds = [dto.cashierId, dto.salespersonId].filter(
      (id): id is string => Boolean(id),
    );

    // ── Revenue: payments by method (signed) ────────────────────────────────────
    const revenue = { cash: 0, card: 0, bankTransfer: 0, voucher: 0, points, total: 0 };
    if (invoiceIds.length) {
      const paymentRows = await this.payments.find({
        where: { invoiceId: In(invoiceIds) },
      });
      for (const p of paymentRows) {
        const amount = (signByInvoice.get(p.invoiceId) ?? 1) * Number(p.amount ?? 0);
        if (p.paymentMethod === InvoicePaymentMethod.CASH) revenue.cash += amount;
        else if (p.paymentMethod === InvoicePaymentMethod.CARD) {
          revenue.card += amount;
          other.cardReceiptCount += 1;
        } else if (p.paymentMethod === InvoicePaymentMethod.BANK_TRANSFER) {
          revenue.bankTransfer += amount;
        }
      }

      const promotionRows = await this.promotions.find({
        where: { invoiceId: In(invoiceIds) },
      });
      for (const pr of promotionRows) {
        if (pr.promotionType === VOUCHER_PROMOTION) {
          revenue.voucher +=
            (signByInvoice.get(pr.invoiceId) ?? 1) * Number(pr.discountAmount ?? 0);
          other.voucherCount += 1;
        }
      }
    }
    // Cash refunds live on the invoice header (never an invoice_payments row, and
    // not reliably a cash-payment voucher either) — net them out directly, unsigned
    // (the refunded amount is already an outflow regardless of the invoice's sign).
    for (const inv of invoices) {
      if (inv.refundMethod === RefundMethod.CASH) {
        revenue.cash -= Number(inv.refundedAmount ?? 0);
      }
    }
    // Cash inflow that isn't an invoice payment — debt collected in cash/transfer
    // (Thu nợ) and other misc receipts (Thu khác) — posted via the accounting
    // module's "Phiếu thu" (cash_receipts), never through invoice_payments.
    // `POS_SALE`-purpose receipts are excluded so a POS cash sale is never
    // counted twice (once via invoice_payments here, once via its own receipt).
    const receiptQb = this.cashReceipts
      .createQueryBuilder('r')
      .where('r.organizationId = :org', { org })
      .andWhere('r.status = :posted', { posted: CashVoucherStatus.POSTED })
      .andWhere('r.purpose != :posSale', { posSale: CashReceiptPurpose.POS_SALE });
    applyBranchScope(receiptQb, 'r', branchIds);
    if (from) receiptQb.andWhere('r.voucherDate >= :crFrom', { crFrom: from });
    if (to) receiptQb.andWhere('r.voucherDate <= :crTo', { crTo: to });
    if (voucherStaffIds.length) {
      receiptQb.andWhere('r.staffId IN (:...voucherStaffIds)', { voucherStaffIds });
    }
    const receiptRows = await receiptQb.getMany();
    for (const r of receiptRows) {
      const amount = Number(r.totalAmount ?? 0);
      const method = accountMethod.get(r.cashAccountId);
      if (method === PaymentAccountMethod.BANK_TRANSFER) revenue.bankTransfer += amount;
      else revenue.cash += amount;
    }
    revenue.cash = round2(revenue.cash);
    revenue.card = round2(revenue.card);
    revenue.bankTransfer = round2(revenue.bankTransfer);
    revenue.voucher = round2(revenue.voucher);
    revenue.points = round2(revenue.points);
    revenue.total = round2(
      revenue.cash + revenue.card + revenue.bankTransfer + revenue.voucher + revenue.points,
    );

    // ── Goods sold / returned (line direction split, un-netted) ────────────────
    const goodsSold = { quantity: 0, value: 0 };
    const goodsReturned = { quantity: 0, value: 0 };
    if (invoiceIds.length) {
      const lines = await this.invoiceItems.find({
        where: { invoiceId: In(invoiceIds) },
      });
      for (const l of lines) {
        const bucket = l.direction === ItemDirection.IN ? goodsReturned : goodsSold;
        bucket.quantity += Number(l.quantity ?? 0);
        bucket.value += Number(l.lineTotal ?? 0);
      }
    }
    goodsSold.quantity = round2(goodsSold.quantity);
    goodsSold.value = round2(goodsSold.value);
    goodsReturned.quantity = round2(goodsReturned.quantity);
    goodsReturned.value = round2(goodsReturned.value);

    // ── Expense: posted cash-payment vouchers (phiếu chi), split cash / transfer ─
    const expense = { cash: 0, bankTransfer: 0, total: 0 };
    const cashQb = this.cashPayments
      .createQueryBuilder('p')
      .where('p.organizationId = :org', { org })
      .andWhere('p.status = :posted', { posted: CashVoucherStatus.POSTED });
    applyBranchScope(cashQb, 'p', branchIds);
    if (from) cashQb.andWhere('p.voucherDate >= :cpFrom', { cpFrom: from });
    if (to) cashQb.andWhere('p.voucherDate <= :cpTo', { cpTo: to });
    if (voucherStaffIds.length) {
      cashQb.andWhere('p.staffId IN (:...voucherStaffIds)', { voucherStaffIds });
    }
    const cashRows = await cashQb.getMany();
    for (const p of cashRows) {
      const amount = Number(p.totalAmount ?? 0);
      // The source fund account's method decides the bucket; unmapped funds are
      // treated as cash (the fund is a cash box by default).
      const method = accountMethod.get(p.cashAccountId);
      if (method === PaymentAccountMethod.CASH || method === undefined) expense.cash += amount;
      else expense.bankTransfer += amount;
    }
    expense.cash = round2(expense.cash);
    expense.bankTransfer = round2(expense.bankTransfer);
    expense.total = round2(expense.cash + expense.bankTransfer);

    // ── Debt: new credit debt recorded + repayments collected ──────────────────
    // Both queries join back to the source invoice (invoice_debts.invoiceId is a
    // real 1:1 FK; debt_payments reaches it via debtId) so cashier/salesperson
    // filters narrow debt the same way they narrow revenue.
    const newDebtQb = this.invoiceDebts
      .createQueryBuilder('d')
      .where('d.organizationId = :org', { org })
      .andWhere('d.documentType = :creditType', {
        creditType: DebtDocumentType.CREDIT_INVOICE,
      });
    applyBranchScope(newDebtQb, 'd', branchIds);
    if (from) newDebtQb.andWhere('d.issuedAt >= :dFrom', { dFrom: from });
    if (to) newDebtQb.andWhere('d.issuedAt <= :dTo', { dTo: to });
    if (dto.cashierId || dto.salespersonId) {
      newDebtQb.innerJoin(InvoiceEntity, 'debtInvoice', 'debtInvoice.id = d.invoiceId');
      if (dto.cashierId) {
        newDebtQb.andWhere('debtInvoice.staffId = :cashier', { cashier: dto.cashierId });
      }
      if (dto.salespersonId) {
        newDebtQb.andWhere('debtInvoice.salespersonId = :sp', { sp: dto.salespersonId });
      }
    }
    const debtRows = await newDebtQb.getMany();
    const newDebt = round2(
      debtRows.reduce((s, d) => s + Number(d.originalAmount ?? 0), 0),
    );

    const debtCollectedQb = this.debtPayments
      .createQueryBuilder('dp')
      .where('dp.organizationId = :org', { org });
    applyBranchScope(debtCollectedQb, 'dp', branchIds);
    new FilterBuilder(debtCollectedQb).applyDateRange('dp.paidAt', dto.issuedAt);
    if (dto.cashierId || dto.salespersonId) {
      debtCollectedQb
        .innerJoin(InvoiceDebtEntity, 'paidDebt', 'paidDebt.id = dp.debtId')
        .innerJoin(InvoiceEntity, 'paidDebtInvoice', 'paidDebtInvoice.id = paidDebt.invoiceId');
      if (dto.cashierId) {
        debtCollectedQb.andWhere('paidDebtInvoice.staffId = :cashier2', {
          cashier2: dto.cashierId,
        });
      }
      if (dto.salespersonId) {
        debtCollectedQb.andWhere('paidDebtInvoice.salespersonId = :sp2', {
          sp2: dto.salespersonId,
        });
      }
    }
    const repayRows = await debtCollectedQb.getMany();
    const debtCollected = round2(
      repayRows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    );

    return {
      revenue,
      expense,
      netCashFlow: round2(revenue.total - expense.total),
      debt: { newDebt, debtCollected },
      goodsSold,
      goodsReturned,
      other,
    };
  }
}
