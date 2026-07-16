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
import {
  GoodsReceiptEntity,
  GoodsReceiptPaymentMethod,
} from '../../../inventory/goods-receipt/goods-receipt.entity';
import { GoodsReceiptLineEntity } from '../../../inventory/goods-receipt/goods-receipt-line.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ProductEntity } from '../../../inventory/product/product.entity';
import { SupplierDebtPaymentEntity } from '../../../inventory/supplier-debt/supplier-debt-payment.entity';
import { SupplierDebtEntity } from '../../../inventory/supplier-debt/supplier-debt.entity';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { debtColumn } from '../debt-report-column.util';
import { DebtReportFilterDto } from '../dto/debt-report-filter.dto';
import { DebtReportSearchDto } from '../dto/debt-report-search.dto';
import { ReportDefinition } from '../report-definition';

/** Columns present regardless of "Thống kê theo" (groupBy). */
const BASE_COLUMNS = [
  'date',
  'documentNumber',
  'documentType',
  'sku',
  'itemName',
  'documentDescription',
  'itemCategory',
  'unit',
] as const;

/** Columns 1-8 formula breakdown — only present when groupBy = 'item' ("Hàng hóa"). */
const ITEM_MODE_ONLY_COLUMNS = [
  'quantity',
  'unitPrice',
  'discountPercent',
  'discountAmount',
  'taxRate',
  'taxAmount',
] as const;

/** Present in every mode (as plain totals, no formula breakdown, when groupBy = 'productTemplate'). */
const TOTAL_COLUMNS = ['lineTotal', 'paymentAmount'] as const;

const TAIL_COLUMNS = [
  'cumulativeDebtIncrease',
  'cumulativeDebtDecrease',
  'closingBalance',
] as const;

const NUMBER_COLUMNS = new Set([
  'quantity',
  'unitPrice',
  'lineTotal',
  'discountPercent',
  'discountAmount',
  'taxRate',
  'taxAmount',
  'paymentAmount',
  'cumulativeDebtIncrease',
  'cumulativeDebtDecrease',
  'closingBalance',
]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function paymentMethodLabel(method: GoodsReceiptPaymentMethod): string {
  return method === GoodsReceiptPaymentMethod.CREDIT
    ? 'Ghi nợ nhà cung cấp'
    : 'Thanh toán ngay';
}

/**
 * "Chi tiết công nợ nhà cung cấp theo chứng từ và mặt hàng" — sổ chi tiết
 * công nợ của 1 nhà cung cấp cụ thể (bắt buộc chọn), theo từng phiếu nhập kho
 * + mặt hàng. Chỉ phiếu nhập `paymentMethod = CREDIT` mới phát sinh
 * `SupplierDebtEntity` nên xuất hiện ở đây. KHÁC báo cáo #2: "Công nợ tăng/
 * giảm trong kỳ" là số LUỸ KẾ (cumulative) từ đầu kỳ đến dòng hiện tại, KHÔNG
 * phải delta/dòng — xem cảnh báo trong docs/24-debt-reports-spec.md #4 (điểm
 * dễ nhầm nhất trong toàn epic).
 */
@Injectable()
export class SupplierDebtsDetailByDocumentAndProductReport implements ReportDefinition {
  readonly key = DEBT_REPORT_KEYS.SUPPLIER_DEBTS_DETAIL_BY_DOCUMENT_AND_PRODUCT;

  constructor(
    @InjectRepository(SupplierDebtEntity)
    private readonly supplierDebts: Repository<SupplierDebtEntity>,
    @InjectRepository(SupplierDebtPaymentEntity)
    private readonly supplierDebtPayments: Repository<SupplierDebtPaymentEntity>,
    @InjectRepository(GoodsReceiptEntity)
    private readonly goodsReceipts: Repository<GoodsReceiptEntity>,
    @InjectRepository(GoodsReceiptLineEntity)
    private readonly goodsReceiptLines: Repository<GoodsReceiptLineEntity>,
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly itemCategories: Repository<ItemCategoryEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
  ) {}

  async buildColumns(
    _actor: ActorContext,
    filters?: DebtReportFilterDto,
  ): Promise<ReportColumnHeader[]> {
    const groupBy = filters?.groupBy ?? 'item';
    const keys: string[] =
      groupBy === 'productTemplate'
        ? [...BASE_COLUMNS, ...TOTAL_COLUMNS, ...TAIL_COLUMNS]
        : [
            ...BASE_COLUMNS,
            ...ITEM_MODE_ONLY_COLUMNS.slice(0, 2), // quantity, unitPrice
            'lineTotal',
            ...ITEM_MODE_ONLY_COLUMNS.slice(2), // discountPercent, discountAmount, taxRate, taxAmount
            'paymentAmount',
            ...TAIL_COLUMNS,
          ];
    return keys.map((col) =>
      debtColumn(
        col,
        NUMBER_COLUMNS.has(col)
          ? col === 'discountPercent' || col === 'taxRate'
            ? ReportColumnDataType.PERCENT
            : col === 'quantity'
              ? ReportColumnDataType.NUMBER
              : ReportColumnDataType.CURRENCY
          : col === 'date'
            ? ReportColumnDataType.DATE
            : ReportColumnDataType.STRING,
      ),
    );
  }

  async buildData(
    dto: DebtReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const { supplierId, period } = dto.filters;
    if (!supplierId) {
      throw new BadRequestException('filters.supplierId is required');
    }
    if (!period?.from || !period?.to) {
      throw new BadRequestException('filters.period.from/to is required');
    }
    const orgId = actor.organizationId;
    const groupBy = dto.filters.groupBy ?? 'item';

    const [openingDebts, openingPayments] = await Promise.all([
      this.supplierDebts.find({
        where: { organizationId: orgId, supplierId, issuedAt: LessThan(period.from) },
      }),
      this.paymentsBefore(orgId, supplierId, period.from),
    ]);
    const openingBalance =
      openingDebts.reduce((s, d) => s + Number(d.originalAmount), 0) -
      openingPayments.reduce((s, p) => s + Number(p.amount), 0);

    const [periodDebts, periodPayments] = await Promise.all([
      this.supplierDebts.find({
        where: {
          organizationId: orgId,
          supplierId,
          issuedAt: Between(period.from, period.to),
        },
      }),
      this.paymentsInPeriod(orgId, supplierId, period.from, period.to),
    ]);

    const receiptById = new Map(
      periodDebts.length
        ? (
            await this.goodsReceipts.find({
              where: { id: In(periodDebts.map((d) => d.goodsReceiptId)) },
            })
          ).map((r) => [r.id, r])
        : [],
    );
    const linesByReceiptId = new Map<string, GoodsReceiptLineEntity[]>();
    if (periodDebts.length) {
      const lines = await this.goodsReceiptLines.find({
        where: { goodsReceiptId: In(periodDebts.map((d) => d.goodsReceiptId)) },
      });
      for (const line of lines) {
        const list = linesByReceiptId.get(line.goodsReceiptId) ?? [];
        list.push(line);
        linesByReceiptId.set(line.goodsReceiptId, list);
      }
    }
    const catalogItemIds = [
      ...new Set(
        periodDebts.flatMap((d) => (linesByReceiptId.get(d.goodsReceiptId) ?? []).map((l) => l.itemId)),
      ),
    ];
    const catalogItems = catalogItemIds.length
      ? await this.items.find({ where: { id: In(catalogItemIds) } })
      : [];
    const itemById = new Map(catalogItems.map((i) => [i.id, i]));

    const categoryIds = [
      ...new Set(catalogItems.map((i) => i.categoryId).filter((v): v is string => !!v)),
    ];
    const categoryNameById = new Map(
      categoryIds.length
        ? (await this.itemCategories.find({ where: { id: In(categoryIds) } })).map((c) => [c.id, c.name])
        : [],
    );

    const productIds = [
      ...new Set(catalogItems.map((i) => i.productId).filter((v): v is string => !!v)),
    ];
    const productById = new Map(
      productIds.length
        ? (await this.products.find({ where: { id: In(productIds) } })).map((p) => [p.id, p])
        : [],
    );

    type Group = { sortKey: number; rows: ReportRow[] };
    const groups: Group[] = [];

    for (const debt of periodDebts) {
      const receipt = receiptById.get(debt.goodsReceiptId);
      const lines = linesByReceiptId.get(debt.goodsReceiptId) ?? [];
      const typeLabel = `Phiếu nhập hàng - ${paymentMethodLabel(receipt?.paymentMethod ?? GoodsReceiptPaymentMethod.CREDIT)}`;

      const rows: ReportRow[] = lines.map((line, idx) => {
        const item = itemById.get(line.itemId);
        const product = item?.productId ? productById.get(item.productId) : undefined;
        const quantity = Number(line.quantity);
        const unitPrice = Number(line.unitPrice);
        const lineTotal = round2(Number(line.lineTotal));
        // Schema gap (confirmed, see docs/24-debt-reports-spec.md #4): no discount/tax
        // fields exist yet on GoodsReceiptLineEntity — hard-code 0 until a future entity adds them.
        const discountPercent = 0;
        const discountAmount = 0;
        const taxRate = 0;
        const taxAmount = 0;
        const paymentAmount = round2(lineTotal - discountAmount + taxAmount);

        const useTemplate = groupBy === 'productTemplate' && product;
        return {
          date: idx === 0 ? (receipt?.receivedAt?.toISOString().slice(0, 10) ?? null) : null,
          documentNumber: idx === 0 ? (receipt?.documentNumber ?? null) : null,
          documentType: idx === 0 ? typeLabel : null,
          documentDescription: idx === 0 ? (receipt?.reason ?? null) : null,
          sku: useTemplate ? (product!.code ?? null) : (item?.code ?? null),
          itemName: useTemplate ? product!.name : (item?.name ?? null),
          itemCategory: item?.categoryId ? (categoryNameById.get(item.categoryId) ?? null) : null,
          unit: line.uomCode,
          quantity,
          unitPrice,
          lineTotal,
          discountPercent,
          discountAmount,
          taxRate,
          taxAmount,
          paymentAmount,
          cumulativeDebtIncrease: null, // filled once the full chronological sequence is known
          cumulativeDebtDecrease: null,
          closingBalance: null,
          __rowKind: 'item',
          __increase: paymentAmount,
          __decrease: 0,
        } as ReportRow & { __increase: number; __decrease: number };
      });

      groups.push({
        sortKey: receipt?.receivedAt?.getTime() ?? new Date(debt.issuedAt).getTime(),
        rows,
      });
    }

    for (const payment of periodPayments) {
      const row = {
        date: payment.paidAt.toISOString().slice(0, 10),
        documentNumber: null,
        documentType: 'Phiếu chi',
        documentDescription: payment.note ?? null,
        sku: null,
        itemName: null,
        itemCategory: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        lineTotal: null,
        discountPercent: null,
        discountAmount: null,
        taxRate: null,
        taxAmount: null,
        paymentAmount: null,
        cumulativeDebtIncrease: null,
        cumulativeDebtDecrease: null,
        closingBalance: null,
        __rowKind: 'item',
        __increase: 0,
        __decrease: round2(Number(payment.amount)),
      } as ReportRow & { __increase: number; __decrease: number };
      groups.push({ sortKey: payment.paidAt.getTime(), rows: [row] });
    }

    groups.sort((a, b) => a.sortKey - b.sortKey);

    let cumulativeIncrease = 0;
    let cumulativeDecrease = 0;
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
        lineTotal: null,
        discountPercent: null,
        discountAmount: null,
        taxRate: null,
        taxAmount: null,
        paymentAmount: null,
        cumulativeDebtIncrease: null,
        cumulativeDebtDecrease: null,
        closingBalance: round2(openingBalance),
        __rowKind: 'opening',
      },
    ];

    for (const group of groups) {
      const subtotal: Record<string, number> = {
        quantity: 0,
        lineTotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        paymentAmount: 0,
      };
      for (const row of group.rows) {
        const r = row as ReportRow & { __increase: number; __decrease: number };
        cumulativeIncrease = round2(cumulativeIncrease + r.__increase);
        cumulativeDecrease = round2(cumulativeDecrease + r.__decrease);
        const closingBalance = round2(openingBalance + cumulativeIncrease - cumulativeDecrease);
        flat.push({
          ...row,
          cumulativeDebtIncrease: cumulativeIncrease,
          cumulativeDebtDecrease: cumulativeDecrease,
          closingBalance,
          __rowKind: 'item',
        });
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
        lineTotal: round2(subtotal.lineTotal),
        discountPercent: null,
        discountAmount: round2(subtotal.discountAmount),
        taxRate: null,
        taxAmount: round2(subtotal.taxAmount),
        paymentAmount: round2(subtotal.paymentAmount),
        cumulativeDebtIncrease: cumulativeIncrease,
        cumulativeDebtDecrease: cumulativeDecrease,
        closingBalance: round2(openingBalance + cumulativeIncrease - cumulativeDecrease),
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

    const leafRows = filtered.filter((r) => r.__rowKind !== 'subtotal');
    const totals: ReportRow = {};
    for (const col of dto.columns) {
      if (col === 'closingBalance' || col === 'cumulativeDebtIncrease' || col === 'cumulativeDebtDecrease') {
        totals[col] = filtered.length ? filtered[filtered.length - 1][col] : null;
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

  private async paymentsBefore(
    orgId: string,
    supplierId: string,
    before: string,
  ): Promise<SupplierDebtPaymentEntity[]> {
    return this.supplierDebtPayments
      .createQueryBuilder('p')
      .innerJoin(SupplierDebtEntity, 'debt', 'debt.id = p.debtId')
      .where('p.organizationId = :orgId', { orgId })
      .andWhere('debt.supplierId = :supplierId', { supplierId })
      .andWhere('p.paidAt < :before', { before })
      .getMany();
  }

  private async paymentsInPeriod(
    orgId: string,
    supplierId: string,
    from: string,
    to: string,
  ): Promise<SupplierDebtPaymentEntity[]> {
    return this.supplierDebtPayments
      .createQueryBuilder('p')
      .innerJoin(SupplierDebtEntity, 'debt', 'debt.id = p.debtId')
      .where('p.organizationId = :orgId', { orgId })
      .andWhere('debt.supplierId = :supplierId', { supplierId })
      .andWhere('p.paidAt BETWEEN :from AND :to', { from, to })
      .getMany();
  }
}
