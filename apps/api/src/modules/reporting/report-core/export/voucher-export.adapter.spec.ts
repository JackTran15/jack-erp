import { ReportColumnDataType, VoucherKind, VoucherPrintPayload } from '@erp/shared-interfaces';
import { voucherToReportDocument } from './voucher-export.adapter';

function payload(overrides: Partial<VoucherPrintPayload> = {}): VoucherPrintPayload {
  return {
    kind: VoucherKind.GOODS_RECEIPT,
    paper: 'A4',
    title: 'PHIẾU NHẬP KHO',
    docNo: 'IMP000001',
    docDate: '09/07/2026',
    branch: { name: 'Chi nhánh Hồ Chí Minh', address: null, phone: null },
    info: [
      { label: 'Đối tượng', value: 'Nhân viên HCM' },
      { label: 'Người giao', value: 'NV 01' },
    ],
    lineColumns: [
      { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
      { col: 'quantity', label: 'Số lượng', type: ReportColumnDataType.NUMBER },
    ],
    lines: [{ sku: 'ABA2777-D-38', quantity: 10 }],
    totals: { sku: null, quantity: 10 },
    signatures: ['Người giao hàng', 'Người nhận hàng', 'Thủ kho'],
    ...overrides,
  };
}

describe('voucherToReportDocument', () => {
  it('maps title+docNo, branch, info rows, columns, lines and totals', () => {
    const doc = voucherToReportDocument(payload());

    expect(doc.header.title).toBe('PHIẾU NHẬP KHO IMP000001');
    expect(doc.header.branch?.name).toBe('Chi nhánh Hồ Chí Minh');
    expect(doc.header.subtitleLines).toEqual([
      'Đối tượng: Nhân viên HCM',
      'Người giao: NV 01',
    ]);
    expect(doc.columns).toEqual(payload().lineColumns);
    expect(doc.rows).toEqual(payload().lines);
    expect(doc.totals).toEqual({ sku: null, quantity: 10 });
  });

  it('drops signatures and amountInWords — they belong to the printed page, not a spreadsheet', () => {
    const doc = voucherToReportDocument(
      payload({ amountInWords: 'Một triệu đồng chẵn' }),
    );
    expect(JSON.stringify(doc)).not.toContain('amountInWords');
    expect(JSON.stringify(doc)).not.toContain('Một triệu');
    expect(JSON.stringify(doc)).not.toContain('Người giao hàng');
  });

  it('passes null totals through unchanged', () => {
    const doc = voucherToReportDocument(payload({ totals: null }));
    expect(doc.totals).toBeNull();
  });
});
