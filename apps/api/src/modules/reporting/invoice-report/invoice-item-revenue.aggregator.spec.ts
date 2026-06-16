import { ReportColumnDataType } from '@erp/shared-interfaces';
import {
  InvoiceItemRowInput,
  buildItemRow,
  buildItemTotals,
  itemCellValue,
} from './invoice-item-revenue.aggregator';

const row = (over: Partial<InvoiceItemRowInput> = {}): InvoiceItemRowInput => ({
  invoiceId: 'i1',
  sortOrder: 0,
  issuedAt: new Date('2026-06-03T08:30:00Z'),
  invoiceCode: 'HD000001',
  invoiceNote: 'ghi chú hóa đơn',
  itemCode: 'SKU001',
  itemName: 'Giày thể thao',
  unit: 'đôi',
  quantity: 2,
  unitPrice: 1200000,
  lineDiscount: 200000,
  lineTotal: 2200000,
  itemNote: 'ghi chú hàng',
  itemCategory: 'Giày dép',
  locationCode: 'A-01',
  locationName: 'Kệ A1',
  customerCode: 'KH000001',
  customerName: 'Nguyễn Văn A',
  customerGroup: 'VIP',
  customerPhone: '0900000000',
  cashierCode: 'NV000002',
  cashierName: 'Trần Thu Ngân',
  salespersonCode: 'NV000003',
  salespersonName: 'Lê Bán Hàng',
  storeName: 'Chi nhánh 1',
  supplier: 'NCC ABC',
  ...over,
});

describe('itemCellValue', () => {
  it('reads backed line/invoice fields, splitting date and time', () => {
    const r = row();
    expect(itemCellValue('date', r)).toBe('2026-06-03');
    expect(itemCellValue('time', r)).toBe('08:30');
    expect(itemCellValue('invoiceCode', r)).toBe('HD000001');
    expect(itemCellValue('sku', r)).toBe('SKU001');
    expect(itemCellValue('itemName', r)).toBe('Giày thể thao');
    expect(itemCellValue('unit', r)).toBe('đôi');
    expect(itemCellValue('quantity', r)).toBe(2);
    expect(itemCellValue('unitPrice', r)).toBe(1200000);
    expect(itemCellValue('lineDiscount', r)).toBe(200000);
    expect(itemCellValue('lineRevenue', r)).toBe(2200000);
    expect(itemCellValue('invoiceNote', r)).toBe('ghi chú hóa đơn');
    expect(itemCellValue('itemNote', r)).toBe('ghi chú hàng');
  });

  it('computes the gross line amount (quantity * unitPrice)', () => {
    expect(itemCellValue('lineAmount', row())).toBe(2400000); // 2 * 1.2m
  });

  it('returns deterministic placeholders for unbacked columns', () => {
    const r = row();
    expect(itemCellValue('revenue.promoPoints', r)).toBe(0);
    expect(itemCellValue('reference', r)).toBeNull();
    expect(itemCellValue('payment.bankAccount', r)).toBeNull();
    expect(itemCellValue('salesChannel', r)).toBeNull();
    expect(itemCellValue('receiver', r)).toBeNull();
    expect(itemCellValue('receiverPhone', r)).toBeNull();
  });

  it('inlines resolved relations, with store code and name both = branch name', () => {
    const r = row();
    expect(itemCellValue('itemCategory', r)).toBe('Giày dép');
    expect(itemCellValue('locationCode', r)).toBe('A-01');
    expect(itemCellValue('locationName', r)).toBe('Kệ A1');
    expect(itemCellValue('customerCode', r)).toBe('KH000001');
    expect(itemCellValue('customer', r)).toBe('Nguyễn Văn A');
    expect(itemCellValue('customerGroup', r)).toBe('VIP');
    expect(itemCellValue('customerPhone', r)).toBe('0900000000');
    expect(itemCellValue('cashierCode', r)).toBe('NV000002');
    expect(itemCellValue('cashier', r)).toBe('Trần Thu Ngân');
    expect(itemCellValue('salespersonCode', r)).toBe('NV000003');
    expect(itemCellValue('salesperson', r)).toBe('Lê Bán Hàng');
    expect(itemCellValue('storeCode', r)).toBe('Chi nhánh 1');
    expect(itemCellValue('storeName', r)).toBe('Chi nhánh 1');
    expect(itemCellValue('supplier', r)).toBe('NCC ABC');
  });
});

describe('buildItemRow', () => {
  it('returns self-describing cells in the requested column order', () => {
    const cells = buildItemRow(['date', 'sku', 'lineRevenue'], row());
    expect(cells).toEqual([
      { col: 'date', type: ReportColumnDataType.DATE, value: '2026-06-03' },
      { col: 'sku', type: ReportColumnDataType.STRING, value: 'SKU001' },
      { col: 'lineRevenue', type: ReportColumnDataType.CURRENCY, value: 2200000 },
    ]);
  });
});

describe('buildItemTotals', () => {
  it('sums quantity and money columns, but not unit price or strings', () => {
    const rows = [row(), row({ quantity: 3, lineTotal: 3000000 })];
    const totals = buildItemTotals(
      ['sku', 'quantity', 'unitPrice', 'lineRevenue'],
      rows,
    );
    expect(totals[0]).toMatchObject({ col: 'sku', value: null });
    expect(totals[1]).toMatchObject({ col: 'quantity', value: 5 });
    // per-unit price is not a meaningful total
    expect(totals[2]).toMatchObject({ col: 'unitPrice', value: null });
    expect(totals[3]).toMatchObject({ col: 'lineRevenue', value: 5200000 });
  });
});
