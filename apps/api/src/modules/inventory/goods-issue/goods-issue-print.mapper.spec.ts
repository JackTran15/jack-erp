import { VoucherKind } from '@erp/shared-interfaces';
import { mapGoodsIssueToVoucherPayload } from './goods-issue-print.mapper';
import { GoodsIssueEntity } from './goods-issue.entity';

function issue(overrides: Record<string, unknown> = {}): GoodsIssueEntity {
  return {
    documentNumber: 'XK001148',
    occurredAt: new Date(2026, 6, 29, 22, 16),
    createdAt: new Date(2026, 6, 1),
    counterparty: { kind: 'EMPLOYEE', id: 'e1', code: null, name: 'A VINH' },
    deliverer: 'HÀO',
    reason: 'MT XUẤT AKHL6488-K-36 HÀNG TOA LỘN SIZE',
    notes: null,
    branchId: 'branch-1',
    lines: [
      {
        item: {
          code: 'AKHL6488-K-36',
          name: 'Dép nữ   AKHL6488-K-36',
          unit: 'Đôi',
          sellingPrice: 400000,
        },
        location: { name: 'E20.02', storageId: 'storage-1' },
        quantity: 1,
        unitPrice: '315000',
        lineTotal: '315000',
        notes: 'ĐỔI THÀNH KEM 39',
      },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as GoodsIssueEntity;
}

describe('mapGoodsIssueToVoucherPayload', () => {
  it('uses the column set the reference voucher prints', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue(), null);

    expect(payload.lineColumns.map((c) => c.label)).toEqual([
      'STT',
      'Mã SKU',
      'Tên hàng hóa',
      'ĐVT',
      'Vị trí',
      'Số lượng',
      'Đơn giá',
      'Thành tiền',
      'Giá bán',
      'Thành tiền giá bán',
      'Ghi chú',
    ]);
    expect(payload.lineColumns.map((c) => c.col)).not.toContain('warehouse');
  });

  it('spans the product name and hides the sale columns, like the receipt', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue(), null);
    const byCol = new Map(payload.lineColumns.map((c) => [c.col, c]));

    expect(byCol.get('name')?.span).toBe(4);
    expect(byCol.get('salePrice')?.hidden).toBe(true);
    expect(byCol.get('saleTotal')?.hidden).toBe(true);
  });

  it('fills the sale columns from the item price', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue(), null);

    expect(payload.lines[0].salePrice).toBe(400000);
    expect(payload.lines[0].saleTotal).toBe(400000);
    expect(payload.totals?.saleTotal).toBe(400000);
    expect(payload.totals?.salePrice).toBeNull();
  });

  it('reads the unit off the item, since an issue line has no uomCode', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue(), null);

    expect(payload.lines[0].uom).toBe('Đôi');
  });

  it('maps header fields, numbers the lines and sums totals', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue(), {
      name: 'Chi nhánh Mậu Thân - CT',
      address: null,
      phone: null,
    });

    expect(payload.kind).toBe(VoucherKind.GOODS_ISSUE);
    expect(payload.title).toBe('PHIẾU XUẤT KHO');
    expect(payload.docNo).toBe('XK001148');
    expect(payload.lines[0]).toMatchObject({
      stt: 1,
      sku: 'AKHL6488-K-36',
      position: 'E20.02',
      quantity: 1,
      lineTotal: 315000,
      note: 'ĐỔI THÀNH KEM 39',
    });
    expect(payload.totals).toMatchObject({ quantity: 1, lineTotal: 315000 });
  });

  it('labels the totals row "Cộng" the way the reference issue voucher does', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue(), null);

    expect(payload.totalsLabel).toBe('Cộng');
    expect(payload.amountInWords).toBe('Ba trăm mười lăm nghìn đồng chẵn.');
  });

  it('carries the five signature boxes', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue(), null);

    expect(payload.signatures).toHaveLength(5);
    expect(payload.signatures[0]).toBe('Người lập phiếu');
  });

  it('adds the transfer destination store line only when the issue came from a transfer', () => {
    const fromTransfer = mapGoodsIssueToVoucherPayload(issue(), null, 'Kho tổng');
    expect(fromTransfer.info).toContainEqual({
      label: 'Cửa hàng nhận điều chuyển',
      value: 'Kho tổng',
    });

    const plain = mapGoodsIssueToVoucherPayload(issue(), null);
    expect(
      plain.info.some((row) => row.label === 'Cửa hàng nhận điều chuyển'),
    ).toBe(false);
  });

  it('falls back to createdAt when occurredAt is absent', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue({ occurredAt: null }), null);

    expect(payload.docDate).toBe('1 tháng 7 năm 2026');
  });

  it('returns null totals and no amount in words when there are no lines', () => {
    const payload = mapGoodsIssueToVoucherPayload(issue({ lines: [] }), null);

    expect(payload.totals).toBeNull();
    expect(payload.amountInWords).toBeUndefined();
  });
});
