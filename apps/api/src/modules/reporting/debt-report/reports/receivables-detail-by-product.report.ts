import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, Repository } from 'typeorm';
import {
  DEBT_REPORT_KEYS,
  InvoiceReportResult,
  ReportCellValue,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashReceiptPurpose } from '../../../accounting/cash-vouchers/enums';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { BranchEntity } from '../../../branch/branch.entity';
import { DebtPaymentEntity, DebtPaymentMethod } from '../../../pos/entities/debt-payment.entity';
import { InvoiceDebtEntity } from '../../../pos/entities/invoice-debt.entity';
import { InvoiceEntity } from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { debtColumn } from '../debt-report-column.util';
import { DebtReportSearchDto } from '../dto/debt-report-search.dto';
import { ReportDefinition } from '../report-definition';

const COLUMNS = [
  'date',
  'documentNumber',
  'documentType',
  'documentDescription',
  'sku',
  'itemName',
  'itemCategory',
  'unit',
  'quantity',
  'unitPrice',
  'revenueGoods',
  'revenuePromotion',
  'revenueTotal',
  'lineCollected',
  'lineDebtIncrease',
  'lineDebtDecrease',
  'runningBalance',
  'branchName',
] as const;

const NUMBER_COLUMNS = new Set([
  'quantity',
  'unitPrice',
  'revenueGoods',
  'revenuePromotion',
  'revenueTotal',
  'lineCollected',
  'lineDebtIncrease',
  'lineDebtDecrease',
  'runningBalance',
]);

/** A document group: 1+ item rows (invoice) or 1 row (payment receipt), followed by a "Cộng" row. */
interface DocumentGroup {
  date: string;
  sortKey: number;
  documentNumber: string;
  documentType: string;
  description: string;
  branchName: string | null;
  rows: ReportRow[];
}

function paymentMethodLabel(method: DebtPaymentMethod): string {
  return method === DebtPaymentMethod.BANK_TRANSFER ? 'Chuyển khoản' : 'Tiền mặt';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * "Chi tiết công nợ phải thu theo mặt hàng" — sổ chi tiết công nợ của 1 khách
 * hàng cụ thể (bắt buộc chọn), mỗi dòng là 1 chứng từ (hoá đơn tín dụng hoặc
 * phiếu thu nợ), group theo chứng từ + dòng "Cộng" subtotal, số dư luỹ kế chạy
 * theo từng dòng hàng (KHÔNG theo group) — xem docs/24-debt-reports-spec.md #2
 * cho số liệu mẫu đã verify. Chỉ dùng InvoiceDebtEntity/DebtPaymentEntity (nợ
 * POS) — không gộp sổ kế toán như báo cáo #1 (không có trong đặc tả #2).
 */
@Injectable()
export class ReceivablesDetailByProductReport implements ReportDefinition {
  readonly key = DEBT_REPORT_KEYS.RECEIVABLES_DETAIL_BY_PRODUCT;

  constructor(
    @InjectRepository(InvoiceDebtEntity)
    private readonly invoiceDebts: Repository<InvoiceDebtEntity>,
    @InjectRepository(DebtPaymentEntity)
    private readonly debtPayments: Repository<DebtPaymentEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly invoiceItems: Repository<InvoiceItemEntity>,
    @InjectRepository(CashReceiptEntity)
    private readonly cashReceipts: Repository<CashReceiptEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly itemCategories: Repository<ItemCategoryEntity>,
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
  ) {}

  async buildColumns(): Promise<ReportColumnHeader[]> {
    return [
      debtColumn('date', ReportColumnDataType.DATE),
      debtColumn('documentNumber', ReportColumnDataType.STRING),
      debtColumn('documentType', ReportColumnDataType.STRING),
      debtColumn('documentDescription', ReportColumnDataType.STRING),
      debtColumn('sku', ReportColumnDataType.STRING),
      debtColumn('itemName', ReportColumnDataType.STRING),
      debtColumn('itemCategory', ReportColumnDataType.STRING),
      debtColumn('unit', ReportColumnDataType.STRING),
      debtColumn('quantity', ReportColumnDataType.NUMBER),
      debtColumn('unitPrice', ReportColumnDataType.CURRENCY),
      debtColumn('revenueGoods', ReportColumnDataType.CURRENCY),
      debtColumn('revenuePromotion', ReportColumnDataType.CURRENCY),
      debtColumn('revenueTotal', ReportColumnDataType.CURRENCY),
      debtColumn('lineCollected', ReportColumnDataType.CURRENCY),
      debtColumn('lineDebtIncrease', ReportColumnDataType.CURRENCY),
      debtColumn('lineDebtDecrease', ReportColumnDataType.CURRENCY),
      debtColumn('runningBalance', ReportColumnDataType.CURRENCY),
      debtColumn('branchName', ReportColumnDataType.STRING),
    ];
  }

  async buildData(
    dto: DebtReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const { customerId, period } = dto.filters;
    if (!customerId) {
      throw new BadRequestException('filters.customerId is required');
    }
    if (!period?.from || !period?.to) {
      throw new BadRequestException('filters.period.from/to is required');
    }
    const orgId = actor.organizationId;

    // Opening balance: everything strictly before the period start.
    const [openingDebts, openingPayments] = await Promise.all([
      this.invoiceDebts.find({
        where: { organizationId: orgId, customerId, issuedAt: LessThan(period.from) },
      }),
      this.debtPaymentsBeforeForCustomer(orgId, customerId, period.from),
    ]);
    const openingBalance =
      openingDebts.reduce((s, d) => s + Number(d.originalAmount), 0) -
      openingPayments.reduce((s, p) => s + Number(p.amount), 0);

    const [periodDebts, periodPayments] = await Promise.all([
      this.invoiceDebts.find({
        where: {
          organizationId: orgId,
          customerId,
          issuedAt: Between(period.from, period.to),
        },
      }),
      this.debtPaymentsInPeriodForCustomer(orgId, customerId, period.from, period.to),
    ]);

    const branches = await this.branches.find({ where: { organizationId: orgId } });
    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    const invoiceById = new Map(
      periodDebts.length
        ? (
            await this.invoices.find({ where: { id: In(periodDebts.map((d) => d.invoiceId)) } })
          ).map((i) => [i.id, i])
        : [],
    );
    const itemsByInvoiceId = new Map<string, InvoiceItemEntity[]>();
    if (periodDebts.length) {
      const items = await this.invoiceItems.find({
        where: { invoiceId: In(periodDebts.map((d) => d.invoiceId)) },
        order: { sortOrder: 'ASC' },
      });
      for (const item of items) {
        const list = itemsByInvoiceId.get(item.invoiceId) ?? [];
        list.push(item);
        itemsByInvoiceId.set(item.invoiceId, list);
      }
    }
    const categories = await this.itemCategories.find({ where: { organizationId: orgId } });
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    const lineItemIds = [
      ...new Set(
        periodDebts.flatMap((d) => (itemsByInvoiceId.get(d.invoiceId) ?? []).map((l) => l.itemId)),
      ),
    ];
    const catalogItems = lineItemIds.length
      ? await this.items.find({ where: { id: In(lineItemIds) } })
      : [];
    const itemsById = new Map(catalogItems.map((i) => [i.id, i]));

    const cashReceiptById = new Map(
      periodPayments.length
        ? (
            await this.cashReceipts.find({
              where: { id: In(periodPayments.map((p) => p.cashReceiptId).filter((v): v is string => !!v)) },
            })
          ).map((c) => [c.id, c])
        : [],
    );

    const groups: DocumentGroup[] = [];

    for (const debt of periodDebts) {
      const invoice = invoiceById.get(debt.invoiceId);
      const lines = itemsByInvoiceId.get(debt.invoiceId) ?? [];
      const totalGoods = lines.reduce((s, l) => s + Number(l.lineTotal), 0);
      const creditAmount = Number(debt.originalAmount);
      // Sequential ("waterfall") allocation: the cash/transfer collected at
      // checkout pays off line totals in order until it runs out, then every
      // remaining line is pure credit. This is NOT a proportional split —
      // verified against the confirmed mockup numbers in
      // docs/24-debt-reports-spec.md #2 (6 lines fully paid, 1 line split,
      // 6 lines fully unpaid), which a proportional-per-line split cannot
      // reproduce.
      let remainingCash = Math.max(totalGoods - creditAmount, 0);

      const rows: ReportRow[] = lines.map((line, idx) => {
        const item = itemsById.get(line.itemId);
        const revenueGoods = round2(Number(line.quantity) * Number(line.unitPrice));
        const revenuePromotion = round2(Number(line.lineDiscount));
        const revenueTotal = round2(Number(line.lineTotal));
        const lineCollected = round2(Math.min(remainingCash, revenueTotal));
        remainingCash = round2(remainingCash - lineCollected);
        const lineDebtIncrease = round2(revenueTotal - lineCollected);
        return {
          date: idx === 0 ? (invoice?.issuedAt?.toISOString().slice(0, 10) ?? debt.issuedAt) : null,
          documentNumber: idx === 0 ? (invoice?.code ?? null) : null,
          documentType: idx === 0 ? 'Hóa đơn bán hàng' : null,
          documentDescription:
            idx === 0 ? `Ghi công nợ khách hàng cho hóa đơn số ${invoice?.code ?? ''}` : null,
          sku: line.itemCode,
          itemName: line.itemName,
          itemCategory: item?.categoryId ? (categoryNameById.get(item.categoryId) ?? null) : null,
          unit: line.unit,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          revenueGoods,
          revenuePromotion,
          revenueTotal,
          lineCollected,
          lineDebtIncrease,
          lineDebtDecrease: 0,
          runningBalance: null, // filled once the full chronological sequence is known
          branchName: idx === 0 ? (branchNameById.get(invoice?.branchId ?? '') ?? null) : null,
          __rowKind: 'item',
        };
      });

      groups.push({
        date: invoice?.issuedAt?.toISOString() ?? debt.issuedAt,
        sortKey: invoice?.issuedAt?.getTime() ?? new Date(debt.issuedAt).getTime(),
        documentNumber: invoice?.code ?? debt.referenceCode,
        documentType: 'Hóa đơn bán hàng',
        description: `Ghi công nợ khách hàng cho hóa đơn số ${invoice?.code ?? ''}`,
        branchName: branchNameById.get(invoice?.branchId ?? '') ?? null,
        rows,
      });
    }

    for (const payment of periodPayments) {
      const receipt = payment.cashReceiptId ? cashReceiptById.get(payment.cashReceiptId) : undefined;
      const typeLabel = `${receipt?.purpose === CashReceiptPurpose.DEBT_COLLECTION ? 'Phiếu thu nợ' : 'Phiếu thu'} - ${paymentMethodLabel(payment.paymentMethod)}`;
      const branchName = receipt?.branchId ? (branchNameById.get(receipt.branchId) ?? null) : null;
      const row: ReportRow = {
        date: payment.paidAt.toISOString().slice(0, 10),
        documentNumber: receipt?.documentNumber ?? null,
        documentType: typeLabel,
        documentDescription: receipt?.reason ?? null,
        sku: null,
        itemName: null,
        itemCategory: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        revenueGoods: null,
        revenuePromotion: null,
        revenueTotal: null,
        lineCollected: null,
        lineDebtIncrease: 0,
        lineDebtDecrease: round2(Number(payment.amount)),
        runningBalance: null,
        branchName,
        __rowKind: 'item',
      };
      groups.push({
        date: payment.paidAt.toISOString(),
        sortKey: payment.paidAt.getTime(),
        documentNumber: receipt?.documentNumber ?? '',
        documentType: typeLabel,
        description: receipt?.reason ?? '',
        branchName,
        rows: [row],
      });
    }

    groups.sort((a, b) => a.sortKey - b.sortKey);

    // Flatten: opening row, then each group's rows + its "Cộng" subtotal row, running balance recomputed incrementally.
    let balance = openingBalance;
    const flat: ReportRow[] = [
      {
        date: null,
        documentNumber: null,
        documentType: null,
        documentDescription: 'Số dư công nợ đầu kỳ',
        sku: null,
        itemName: null,
        itemCategory: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        revenueGoods: null,
        revenuePromotion: null,
        revenueTotal: null,
        lineCollected: null,
        lineDebtIncrease: null,
        lineDebtDecrease: null,
        runningBalance: round2(balance),
        branchName: null,
        __rowKind: 'opening',
      },
    ];

    for (const group of groups) {
      const subtotal: Record<string, number> = {
        quantity: 0,
        revenueGoods: 0,
        revenuePromotion: 0,
        revenueTotal: 0,
        lineCollected: 0,
        lineDebtIncrease: 0,
        lineDebtDecrease: 0,
      };
      for (const row of group.rows) {
        balance = round2(
          balance + (Number(row.lineDebtIncrease) || 0) - (Number(row.lineDebtDecrease) || 0),
        );
        flat.push({ ...row, runningBalance: balance });
        for (const key of Object.keys(subtotal)) {
          subtotal[key] += Number((row as Record<string, ReportCellValue>)[key]) || 0;
        }
      }
      flat.push({
        date: 'Cộng',
        documentNumber: null,
        documentType: null,
        documentDescription: null,
        sku: null,
        itemName: null,
        itemCategory: null,
        unit: null,
        quantity: round2(subtotal.quantity),
        unitPrice: null,
        revenueGoods: round2(subtotal.revenueGoods),
        revenuePromotion: round2(subtotal.revenuePromotion),
        revenueTotal: round2(subtotal.revenueTotal),
        lineCollected: round2(subtotal.lineCollected),
        lineDebtIncrease: round2(subtotal.lineDebtIncrease),
        lineDebtDecrease: round2(subtotal.lineDebtDecrease),
        runningBalance: balance,
        branchName: null,
        __rowKind: 'subtotal',
      });
    }

    const filtered = dto.columnFilters?.length
      ? flat.filter((row) =>
          dto.columnFilters!.every((f) => matchColumnFilter(row[f.col] ?? null, f)),
        )
      : flat;

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageRows = filtered.slice(offset, offset + limit);

    // "Cộng" (subtotal) rows already sum their group's item rows — exclude
    // them here to avoid double-counting the grand total.
    const leafRows = filtered.filter((r) => r.__rowKind !== 'subtotal');
    const totals: ReportRow = {};
    for (const col of dto.columns) {
      if (col === 'runningBalance') {
        totals[col] = balance;
      } else if (NUMBER_COLUMNS.has(col)) {
        totals[col] = leafRows.reduce((s, r) => s + (Number(r[col]) || 0), 0);
      } else {
        totals[col] = null;
      }
    }

    return {
      rows: pageRows.map((r) => this.pick(dto.columns, r)),
      totals: total ? this.pick(dto.columns, totals) : null,
      total,
    };
  }

  private pick(columns: string[], row: ReportRow): ReportRow {
    const picked: ReportRow = {};
    for (const col of columns) picked[col] = row[col] ?? null;
    return picked;
  }

  private async debtPaymentsBeforeForCustomer(
    orgId: string,
    customerId: string,
    before: string,
  ): Promise<DebtPaymentEntity[]> {
    return this.debtPayments
      .createQueryBuilder('p')
      .innerJoin(InvoiceDebtEntity, 'debt', 'debt.id = p.debtId')
      .where('p.organizationId = :orgId', { orgId })
      .andWhere('debt.customerId = :customerId', { customerId })
      .andWhere('p.paidAt < :before', { before })
      .getMany();
  }

  private async debtPaymentsInPeriodForCustomer(
    orgId: string,
    customerId: string,
    from: string,
    to: string,
  ): Promise<DebtPaymentEntity[]> {
    return this.debtPayments
      .createQueryBuilder('p')
      .innerJoin(InvoiceDebtEntity, 'debt', 'debt.id = p.debtId')
      .where('p.organizationId = :orgId', { orgId })
      .andWhere('debt.customerId = :customerId', { customerId })
      .andWhere('p.paidAt BETWEEN :from AND :to', { from, to })
      .getMany();
  }
}
