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
import {
  DebtPaymentEntity,
  DebtPaymentMethod,
} from '../../../pos/entities/debt-payment.entity';
import { InvoicePromotionEntity } from '../../../promotion/invoice-promotion.entity';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import {
  CashPaymentPurpose,
  CashReceiptReferenceType,
  CashVoucherStatus,
} from '../../../accounting/cash-vouchers/enums';
import { BankPaymentEntity } from '../../../accounting/deposit-vouchers/bank-payments/bank-payment.entity';
import { BankReceiptEntity } from '../../../accounting/deposit-vouchers/bank-receipts/bank-receipt.entity';
import {
  BankPaymentPurpose,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../../../accounting/deposit-vouchers/enums';
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
 * Money model — "how much invoice value was settled, and by which instrument",
 * NOT "how much cash entered the fund". Thu reads the invoice domain only.
 * Chi reads the invoice domain for refunds AND the payment vouchers for
 * everything else, because an expense/salary/supplier payout has no sales
 * invoice behind it and would otherwise be invisible on a cashier's report.
 *
 * - Revenue (Thu), every bucket counted in `total`:
 *     cash         = invoice_payments CASH (signed by type) + debt_payments cash
 *                    + cash_receipts whose referenceType is FUND_SWAP
 *     card         = invoice_payments CARD (signed)
 *     bankTransfer = invoice_payments BANK_TRANSFER (signed) + debt_payments bank_transfer
 *                    + bank_receipts whose referenceType is FUND_SWAP
 *     voucher      = invoice_promotions where promotionType='voucher' (signed)
 *     points       = Σ sign × invoice.pointsDiscountAmount
 *   Voucher and points are settlement instruments the customer applies against
 *   `amountDue`, so they belong in `total` exactly like the three cash-ish
 *   methods. A promotion (CTKM, `invoices.discount_amount`) is a price cut, not
 *   a settlement instrument, and is not reported at all.
 *
 * - Expense (Chi), two sources that partition cleanly by `purpose`:
 *     1. Refunds, from the RETURN/EXCHANGE invoice header:
 *          paidOut = refundedAmount − offsetAmount  (offset settles debt, no fund moves)
 *          refundMethod CASH → cash, BANK → bankTransfer;
 *          STORE_CREDIT / OFFSET / null move no money and are skipped.
 *        `paidOut` is a positive magnitude — do NOT apply `invoiceTypeSign`.
 *        That sign is what made a refund count twice before.
 *     2. Every other payout, from the vouchers: posted `cash_payments` → cash,
 *        posted `bank_payments` → bankTransfer, both filtered to
 *        `purpose <> REFUND`.
 *
 *   A fund swap is the one voucher pair Thu has to match: its payout leg is not
 *   REFUND, so Chi counts it, and without the receipt leg the report would book
 *   an outflow for money that only changed fund. See the FUND_SWAP block below.
 *
 *   The `purpose <> REFUND` filter is the whole seam. Every REFUND-purpose
 *   voucher is auto-issued from an invoice (refund-cash/refund-bank consumers
 *   for a return, invoice-cancel-refund-cash for a cancellation), so source 1
 *   owns them; counting them here as well is exactly the double-charge this
 *   report started with. Everything else — EXPENSE, SALARY, PURCHASE,
 *   SUPPLIER_PAYMENT, DEPOSIT_TRANSFER, INTER_BRANCH_OUT, OTHER — has no
 *   invoice behind it and can only come from the voucher.
 *
 *   Dropping cancellation refunds along with return refunds is deliberate, not
 *   collateral: `applyInvoiceStatusFilter` excludes cancelled invoices, so a
 *   cancelled sale contributes to neither Thu nor Chi and nets to zero. Letting
 *   its refund voucher back in would book the outflow without the matching
 *   inflow. On the QA branch that alone was 4.089.000đ of phantom Chi.
 *
 *   No fund-account lookup is involved: a `cash_payments` row *is* cash and a
 *   `bank_payments` row *is* a transfer. The previous code mapped both through
 *   `payment_accounts` keyed on a COA account id while passing a
 *   `cash_accounts.id`, so the lookup always missed and `Chi › Chuyển khoản`
 *   could never be anything but 0.
 *
 * A pure RETURN writes no invoice_payments row at all (checkout-return.service
 * gates payment creation on `netAmount > 0`), and an EXCHANGE has either
 * `netAmount > 0` or `refundedAmount > 0` but never both — so one document can
 * only ever land on Thu or on Chi, never on both.
 *
 * One `debt_payments` row feeds both `revenue.cash|bankTransfer` (cash-in lens)
 * and `debt.debtCollected` (debt-reduction lens); that is two lenses on the same
 * event, not a double count — a credit sale books Thu 0 + Ghi nợ, and only the
 * later repayment books Thu. Paying a supplier debt is the mirror image and
 * needs no special case: it already issues a SUPPLIER_PAYMENT voucher, which
 * source 2 picks up.
 *
 * `netCashFlow` still does not reconcile 1-1 with Sổ quỹ tiền mặt: Thu counts
 * voucher/points settlement that never reaches a fund, and ignores the phiếu thu
 * a POS cash sale issues. That book remains the authority on fund movements.
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
    @InjectRepository(BankPaymentEntity)
    private readonly bankPayments: Repository<BankPaymentEntity>,
    @InjectRepository(CashReceiptEntity)
    private readonly cashReceipts: Repository<CashReceiptEntity>,
    @InjectRepository(BankReceiptEntity)
    private readonly bankReceipts: Repository<BankReceiptEntity>,
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

    // ── Invoices in window (drives revenue / expense / goods / other) ──────────
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
    // Chi is accumulated in the same pass: it is a pure function of the invoice
    // header (refundMethod + refundedAmount − offsetAmount), so no second query.
    const expense = { cash: 0, bankTransfer: 0, total: 0 };
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

      // Money that actually left a fund on this document. Unsigned: it is an
      // outflow magnitude, and the Chi column already means "paid out".
      const paidOut =
        Number(inv.refundedAmount ?? 0) - Number(inv.offsetAmount ?? 0);
      if (paidOut > 0) {
        if (inv.refundMethod === RefundMethod.CASH) expense.cash += paidOut;
        else if (inv.refundMethod === RefundMethod.BANK) {
          expense.bankTransfer += paidOut;
        }
        // STORE_CREDIT / legacy OFFSET / unset: no fund moved.
      }
    }
    const invoiceIds = invoices.map((i) => i.id);

    const from = dateOnly(dto.issuedAt?.from);
    const to = dateOnly(dto.issuedAt?.to);
    // Vouchers carry one staff reference (whoever recorded them), not separate
    // cashier/salesperson roles, so match either filter when set.
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

    // ── Debt repayments (Thu nợ) — money in against an earlier credit sale ─────
    // Read once, reported through two lenses: as cash inflow here, and as
    // `debt.debtCollected` below. `debt_payments` carries its own method, so it
    // needs no fund-account lookup.
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
    // ── Fund swaps: the inflow leg ────────────────────────────────────────────
    // A swap ("Chuyển tiền gửi thành tiền mặt" / "Nộp tiền mặt vào tài khoản")
    // writes a payout voucher on one fund and a receipt on the other. Chi counts
    // the payout leg (DEPOSIT_TRANSFER / CASH_TRANSFER are not REFUND), so the
    // receipt leg has to be counted here or the report books an outflow for money
    // that never left the branch — it only changed fund. Keyed on
    // `referenceType = FUND_SWAP`, not on `purpose`, because both legs are
    // written with the catch-all purpose OTHER; filtering on that would sweep in
    // every unrelated misc receipt.
    //
    // Inter-branch transfers are deliberately NOT paired here: INTER_BRANCH_OUT
    // is a genuine outflow for the sending branch, and its INTER_BRANCH_IN
    // receipt belongs to the receiving branch's own report.
    const swapCashQb = this.cashReceipts
      .createQueryBuilder('r')
      .where('r.organizationId = :org', { org })
      .andWhere('r.status = :posted', { posted: CashVoucherStatus.POSTED })
      .andWhere('r.referenceType = :swap', {
        swap: CashReceiptReferenceType.FUND_SWAP,
      });
    applyBranchScope(swapCashQb, 'r', branchIds);
    if (from) swapCashQb.andWhere('r.voucherDate >= :crFrom', { crFrom: from });
    if (to) swapCashQb.andWhere('r.voucherDate <= :crTo', { crTo: to });
    if (voucherStaffIds.length) {
      swapCashQb.andWhere('r.staffId IN (:...voucherStaffIds)', { voucherStaffIds });
    }
    for (const r of await swapCashQb.getMany()) {
      revenue.cash += Number(r.totalAmount ?? 0);
    }

    const swapBankQb = this.bankReceipts
      .createQueryBuilder('br')
      .where('br.organizationId = :org', { org })
      .andWhere('br.status = :bposted', { bposted: BankVoucherStatus.POSTED })
      .andWhere('br.referenceType = :bswap', {
        bswap: BankReceiptReferenceType.FUND_SWAP,
      });
    applyBranchScope(swapBankQb, 'br', branchIds);
    if (from) swapBankQb.andWhere('br.docDate >= :brFrom', { brFrom: from });
    if (to) swapBankQb.andWhere('br.docDate <= :brTo', { brTo: to });
    for (const br of await swapBankQb.getMany()) {
      revenue.bankTransfer += Number(br.totalAmount ?? 0);
    }

    const repayRows = await debtCollectedQb.getMany();
    let debtCollected = 0;
    for (const r of repayRows) {
      const amount = Number(r.amount ?? 0);
      debtCollected += amount;
      if (r.paymentMethod === DebtPaymentMethod.BANK_TRANSFER) {
        revenue.bankTransfer += amount;
      } else revenue.cash += amount;
    }
    debtCollected = round2(debtCollected);

    revenue.cash = round2(revenue.cash);
    revenue.card = round2(revenue.card);
    revenue.bankTransfer = round2(revenue.bankTransfer);
    revenue.voucher = round2(revenue.voucher);
    revenue.points = round2(revenue.points);
    revenue.total = round2(
      revenue.cash +
        revenue.card +
        revenue.bankTransfer +
        revenue.voucher +
        revenue.points,
    );

    // ── Expense, source 2: payouts with no invoice behind them ────────────────
    // `purpose <> REFUND` is the seam against source 1 — see the class doc.
    const cashQb = this.cashPayments
      .createQueryBuilder('p')
      .where('p.organizationId = :org', { org })
      .andWhere('p.status = :posted', { posted: CashVoucherStatus.POSTED })
      .andWhere('p.purpose != :refund', { refund: CashPaymentPurpose.REFUND });
    applyBranchScope(cashQb, 'p', branchIds);
    if (from) cashQb.andWhere('p.voucherDate >= :cpFrom', { cpFrom: from });
    if (to) cashQb.andWhere('p.voucherDate <= :cpTo', { cpTo: to });
    if (voucherStaffIds.length) {
      cashQb.andWhere('p.staffId IN (:...voucherStaffIds)', { voucherStaffIds });
    }
    for (const p of await cashQb.getMany()) {
      expense.cash += Number(p.totalAmount ?? 0);
    }

    // `bank_payments` has no staff column, so the cashier/salesperson filter
    // cannot narrow it — a filtered view still shows every bank payout.
    const bankQb = this.bankPayments
      .createQueryBuilder('b')
      .where('b.organizationId = :org', { org })
      .andWhere('b.status = :bposted', { bposted: BankVoucherStatus.POSTED })
      .andWhere('b.purpose != :brefund', { brefund: BankPaymentPurpose.REFUND });
    applyBranchScope(bankQb, 'b', branchIds);
    if (from) bankQb.andWhere('b.docDate >= :bpFrom', { bpFrom: from });
    if (to) bankQb.andWhere('b.docDate <= :bpTo', { bpTo: to });
    for (const b of await bankQb.getMany()) {
      expense.bankTransfer += Number(b.totalAmount ?? 0);
    }

    expense.cash = round2(expense.cash);
    expense.bankTransfer = round2(expense.bankTransfer);
    expense.total = round2(expense.cash + expense.bankTransfer);

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

    // ── Debt: new credit debt recorded ─────────────────────────────────────────
    // Joins back to the source invoice (invoice_debts.invoiceId is a real 1:1 FK)
    // so cashier/salesperson filters narrow debt the same way they narrow revenue.
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
