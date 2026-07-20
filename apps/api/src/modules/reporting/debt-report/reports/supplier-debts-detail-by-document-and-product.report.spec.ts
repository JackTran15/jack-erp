import { BadRequestException } from '@nestjs/common';
import { GoodsReceiptPaymentMethod } from '../../../inventory/goods-receipt/goods-receipt.entity';
import { SupplierDebtsDetailByDocumentAndProductReport } from './supplier-debts-detail-by-document-and-product.report';

const ORG = 'org-1';
const SUPPLIER = 's1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;
const period = { from: '2026-07-01', to: '2026-07-31' };
const OPENING = 80360000;

function makeLines(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `line-${i}`,
    goodsReceiptId: 'gr-1',
    itemId: `item-${i}`,
    uomCode: 'Đôi',
    quantity: 1,
    unitPrice: 2800000,
    lineTotal: 2800000,
  }));
}

function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    code: `ABA3335-D-${38 + i}`,
    name: `Sapo nam ABA3335-D-${38 + i}`,
    categoryId: null,
    productId: 'prod-1',
  }));
}

function makeReport(opts: {
  openingDebts?: any[];
  openingPayments?: any[];
  periodDebts?: any[];
  periodPaymentsQbResult?: any[];
  receipts?: any[];
  lines?: any[];
  items?: any[];
  categories?: any[];
  products?: any[];
}) {
  const supplierDebtsRepo: any = {
    find: jest
      .fn()
      .mockResolvedValueOnce(opts.openingDebts ?? [])
      .mockResolvedValueOnce(opts.periodDebts ?? []),
  };
  const paymentQb: any = {
    innerJoin: jest.fn(() => paymentQb),
    where: jest.fn(() => paymentQb),
    andWhere: jest.fn(() => paymentQb),
    getMany: jest
      .fn()
      .mockResolvedValueOnce(opts.openingPayments ?? [])
      .mockResolvedValueOnce(opts.periodPaymentsQbResult ?? []),
  };
  const supplierDebtPaymentsRepo: any = { createQueryBuilder: jest.fn(() => paymentQb) };
  const goodsReceiptsRepo: any = { find: jest.fn(async () => opts.receipts ?? []) };
  const goodsReceiptLinesRepo: any = { find: jest.fn(async () => opts.lines ?? []) };
  const itemsRepo: any = { find: jest.fn(async () => opts.items ?? []) };
  const categoriesRepo: any = { find: jest.fn(async () => opts.categories ?? []) };
  const productsRepo: any = { find: jest.fn(async () => opts.products ?? []) };

  return new SupplierDebtsDetailByDocumentAndProductReport(
    supplierDebtsRepo,
    supplierDebtPaymentsRepo,
    goodsReceiptsRepo,
    goodsReceiptLinesRepo,
    itemsRepo,
    categoriesRepo,
    productsRepo,
  );
}

const ITEM_COLUMNS = [
  'date',
  'documentNumber',
  'documentType',
  'sku',
  'itemName',
  'documentDescription',
  'itemCategory',
  'unit',
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
];

describe('SupplierDebtsDetailByDocumentAndProductReport.buildColumns', () => {
  it('drops the (1)-(8) breakdown columns when groupBy = productTemplate', async () => {
    const report = makeReport({});
    const itemMode = await report.buildColumns(actor, { groupBy: 'item' });
    const templateMode = await report.buildColumns(actor, { groupBy: 'productTemplate' });

    expect(itemMode.map((c) => c.col)).toEqual(
      expect.arrayContaining(['quantity', 'unitPrice', 'discountPercent', 'discountAmount', 'taxRate', 'taxAmount']),
    );
    for (const col of ['quantity', 'unitPrice', 'discountPercent', 'discountAmount', 'taxRate', 'taxAmount']) {
      expect(templateMode.map((c) => c.col)).not.toContain(col);
    }
    // Both modes keep lineTotal/paymentAmount and the 3 cumulative columns.
    for (const col of ['lineTotal', 'paymentAmount', 'cumulativeDebtIncrease', 'cumulativeDebtDecrease', 'closingBalance']) {
      expect(templateMode.map((c) => c.col)).toContain(col);
    }
  });
});

describe('SupplierDebtsDetailByDocumentAndProductReport.buildData', () => {
  it('requires supplierId', async () => {
    const report = makeReport({});
    await expect(
      report.buildData(
        { reportType: 'x', columns: ['date'], filters: { period } } as any,
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reproduces the confirmed mockup numbers: 14-line receipt, cumulative (NOT delta) debt increase, opening 80,360,000', async () => {
    const report = makeReport({
      openingDebts: [{ goodsReceiptId: 'gr-0', originalAmount: OPENING, issuedAt: '2026-06-01' }],
      openingPayments: [],
      periodDebts: [{ goodsReceiptId: 'gr-1', originalAmount: 39200000, issuedAt: '2026-07-15' }],
      receipts: [
        {
          id: 'gr-1',
          documentNumber: 'NK000373',
          paymentMethod: GoodsReceiptPaymentMethod.CREDIT,
          reason: 'DEV TEST',
          receivedAt: new Date('2026-07-15T16:25:00Z'),
        },
      ],
      lines: makeLines(14),
      items: makeItems(14),
    });

    const result = await report.buildData(
      {
        reportType: 'supplier-debts-detail-by-document-and-product',
        columns: ITEM_COLUMNS,
        filters: { supplierId: SUPPLIER, period, groupBy: 'item' },
      } as any,
      actor,
    );

    // rows: [opening, 14 item lines, "Cộng"] = 16
    expect(result.total).toBe(16);
    const rows = result.rows;

    expect(rows[0].documentDescription).toBe('Số dư công nợ đầu kỳ');
    expect(rows[0].closingBalance).toBe(OPENING);

    // Cumulative increase climbs by 2,800,000 per line — NOT a flat per-line delta.
    for (let i = 1; i <= 14; i++) {
      expect(rows[i].paymentAmount).toBe(2800000); // per-line value stays constant
      expect(rows[i].cumulativeDebtIncrease).toBe(2800000 * i); // running total, not per-line
      expect(rows[i].closingBalance).toBe(OPENING + 2800000 * i);
    }
    expect(rows[14].closingBalance).toBe(83160000 + 36400000); // 119,560,000 — matches confirmed mockup exactly
    expect(rows[14].closingBalance).toBe(119560000);

    // "Cộng" row (rows[15]) carries the same cumulative/closing values as the last item line.
    expect(rows[15].date).toBe('Cộng');
    expect(rows[15].quantity).toBe(14);
    expect(rows[15].lineTotal).toBe(39200000);
    expect(rows[15].cumulativeDebtIncrease).toBe(39200000);
    expect(rows[15].closingBalance).toBe(119560000);

    expect(result.totals?.cumulativeDebtIncrease).toBe(39200000);
    expect(result.totals?.closingBalance).toBe(119560000);
  });

  it('shows the parent product template code/name (not the SKU variant) when groupBy = productTemplate, without merging rows', async () => {
    const report = makeReport({
      periodDebts: [{ goodsReceiptId: 'gr-1', originalAmount: 5600000, issuedAt: '2026-07-15' }],
      receipts: [
        {
          id: 'gr-1',
          documentNumber: 'NK000373',
          paymentMethod: GoodsReceiptPaymentMethod.CREDIT,
          receivedAt: new Date('2026-07-15T16:25:00Z'),
        },
      ],
      lines: makeLines(2),
      items: makeItems(2),
      products: [{ id: 'prod-1', code: 'ABA3335', name: 'ABA3335' }],
    });

    const result = await report.buildData(
      {
        reportType: 'supplier-debts-detail-by-document-and-product',
        columns: ['sku', 'itemName', 'lineTotal', 'paymentAmount', 'cumulativeDebtIncrease'],
        filters: { supplierId: SUPPLIER, period, groupBy: 'productTemplate' },
      } as any,
      actor,
    );

    // Still 1 row per underlying line — groupBy does NOT merge rows.
    expect(result.total).toBe(4); // opening + 2 lines + "Cộng"
    expect(result.rows[1]).toMatchObject({ sku: 'ABA3335', itemName: 'ABA3335' });
    expect(result.rows[2]).toMatchObject({ sku: 'ABA3335', itemName: 'ABA3335' });
  });
});
