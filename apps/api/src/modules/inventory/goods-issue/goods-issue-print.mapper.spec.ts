import { VoucherKind } from '@erp/shared-interfaces';
import { mapGoodsIssueToVoucherPayload } from './goods-issue-print.mapper';
import { GoodsIssueEntity } from './goods-issue.entity';

function issue(overrides: Record<string, unknown> = {}): GoodsIssueEntity {
  return {
    documentNumber: 'XK000002',
    occurredAt: new Date('2026-07-09T22:16:00Z'),
    createdAt: new Date('2026-07-09T22:16:00Z'),
    counterparty: { kind: 'EMPLOYEE', id: 'e1', code: null, name: 'Nhân viên HCM' },
    deliverer: '124124124',
    reason: 'Xuất kho hàng hóa điều chuyển đến cửa hàng Hà Nội',
    notes: null,
    branchId: 'branch-1',
    lines: [
      {
        item: { code: 'ABA2777-D-38', name: 'Giày nam ABA2777-D-38' },
        location: { name: 'A01.01', storageId: 'storage-1' },
        quantity: 3,
        unitPrice: '350000',
        lineTotal: '1050000',
      },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as GoodsIssueEntity;
}

describe('mapGoodsIssueToVoucherPayload', () => {
  it('maps header fields, resolves warehouse name, and sums totals', () => {
    const payload = mapGoodsIssueToVoucherPayload(
      issue(),
      { name: 'Hồ Chí Minh', address: null, phone: null },
      new Map([['storage-1', 'Kho lưu trữ HCM']]),
    );

    expect(payload.kind).toBe(VoucherKind.GOODS_ISSUE);
    expect(payload.title).toBe('PHIẾU XUẤT KHO');
    expect(payload.docNo).toBe('XK000002');
    expect(payload.lines[0]).toMatchObject({
      sku: 'ABA2777-D-38',
      warehouse: 'Kho lưu trữ HCM',
      position: 'A01.01',
      quantity: 3,
      lineTotal: 1050000,
    });
    expect(payload.totals).toMatchObject({ quantity: 3, lineTotal: 1050000 });
  });

  it('falls back to createdAt when occurredAt is absent', () => {
    const payload = mapGoodsIssueToVoucherPayload(
      issue({ occurredAt: null }),
      null,
      new Map(),
    );
    expect(payload.docDate).toBe(
      new Date('2026-07-09T22:16:00Z').toLocaleDateString('vi-VN'),
    );
  });

  it('returns null totals when there are no lines', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue({ lines: [] }), null, new Map());
    expect(payload.totals).toBeNull();
  });
});
