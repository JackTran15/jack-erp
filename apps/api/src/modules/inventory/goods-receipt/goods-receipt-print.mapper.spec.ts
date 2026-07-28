import { VoucherKind } from '@erp/shared-interfaces';
import { mapGoodsReceiptToVoucherPayload } from './goods-receipt-print.mapper';
import { GoodsReceiptEntity } from './goods-receipt.entity';

function receipt(overrides: Record<string, unknown> = {}): GoodsReceiptEntity {
  return {
    documentNumber: 'IMP000001',
    receivedAt: new Date('2026-07-09T22:12:00Z'),
    counterparty: { kind: 'EMPLOYEE', id: 'e1', code: null, name: 'Nhân viên HCM' },
    deliveredBy: 'NV 01',
    reason: 'Nhập hàng',
    description: null,
    branchId: 'branch-1',
    lines: [
      {
        item: { code: 'ABA2777-D-38', name: 'Giày nam ABA2777-D-38' },
        location: { name: 'A01.01', storageId: 'storage-1' },
        uomCode: 'Đôi',
        quantity: '10',
        unitPrice: '350000',
        lineTotal: '3500000',
      },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as GoodsReceiptEntity;
}

describe('mapGoodsReceiptToVoucherPayload', () => {
  it('maps header fields, resolves warehouse name, and sums totals', () => {
    const payload = mapGoodsReceiptToVoucherPayload(
      receipt(),
      { name: 'Hồ Chí Minh', address: null, phone: null },
      new Map([['storage-1', 'Kho lưu trữ HCM']]),
    );

    expect(payload.kind).toBe(VoucherKind.GOODS_RECEIPT);
    expect(payload.title).toBe('PHIẾU NHẬP KHO');
    expect(payload.docNo).toBe('IMP000001');
    expect(payload.branch?.name).toBe('Hồ Chí Minh');
    expect(payload.info).toContainEqual({ label: 'Đối tượng', value: 'Nhân viên HCM' });
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({
      sku: 'ABA2777-D-38',
      warehouse: 'Kho lưu trữ HCM',
      position: 'A01.01',
      quantity: 10,
      lineTotal: 3500000,
    });
    expect(payload.totals).toMatchObject({ quantity: 10, lineTotal: 3500000 });
  });

  it('falls back to a dash for missing info fields and null for an unresolved warehouse', () => {
    const payload = mapGoodsReceiptToVoucherPayload(
      receipt({ deliveredBy: undefined }),
      null,
      new Map(),
    );

    expect(payload.branch).toBeNull();
    expect(payload.info).toContainEqual({ label: 'Người giao', value: '—' });
    expect(payload.lines[0].warehouse).toBeNull();
  });

  it('returns null totals when there are no lines', () => {
    const payload = mapGoodsReceiptToVoucherPayload(
      receipt({ lines: [] }),
      null,
      new Map(),
    );
    expect(payload.totals).toBeNull();
  });
});
