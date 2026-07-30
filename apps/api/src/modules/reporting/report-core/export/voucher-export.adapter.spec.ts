import { ReportColumnDataType, VoucherKind, VoucherPrintPayload } from '@erp/shared-interfaces';
import { voucherToReportDocument } from './voucher-export.adapter';

function payload(overrides: Partial<VoucherPrintPayload> = {}): VoucherPrintPayload {
  return {
    kind: VoucherKind.GOODS_RECEIPT,
    paper: 'A4',
    title: 'PHIẾU NHẬP KHO',
    docNo: 'IMP000001',
    docDate: '9 tháng 7 năm 2026',
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
    signatures: ['Người lập phiếu', 'Người nhận hàng', 'Thủ kho'],
    ...overrides,
  };
}

describe('voucherToReportDocument', () => {
  it('maps the title, branch, columns, lines and totals', () => {
    const doc = voucherToReportDocument(payload());

    expect(doc.header.title).toBe('PHIẾU NHẬP KHO');
    expect(doc.header.branch?.name).toBe('Chi nhánh Hồ Chí Minh');
    expect(doc.columns).toEqual(payload().lineColumns);
    expect(doc.rows).toEqual(payload().lines);
    expect(doc.totals).toEqual({ sku: null, quantity: 10 });
  });

  it('leaves the document number out of the title', () => {
    const doc = voucherToReportDocument(payload());

    // The number gets its own centred line, written by VoucherXlsxWriter.
    expect(doc.header.title).not.toContain('IMP000001');
  });

  it('leaves the info rows to the voucher writer instead of folding them into subtitles', () => {
    const doc = voucherToReportDocument(payload());

    expect(doc.header.subtitleLines).toEqual([]);
  });

  it('carries none of the voucher chrome — the writer reads that from the payload', () => {
    const doc = voucherToReportDocument(
      payload({ amountInWords: 'Một triệu đồng chẵn.' }),
    );

    expect(JSON.stringify(doc)).not.toContain('amountInWords');
    expect(JSON.stringify(doc)).not.toContain('Một triệu');
    expect(JSON.stringify(doc)).not.toContain('Người lập phiếu');
  });

  it('passes null totals through unchanged', () => {
    const doc = voucherToReportDocument(payload({ totals: null }));
    expect(doc.totals).toBeNull();
  });
});
