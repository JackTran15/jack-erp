import { VoucherKind } from '@erp/shared-interfaces';
import { mapGoodsReceiptToVoucherPayload } from './goods-receipt-print.mapper';
import { GoodsReceiptEntity } from './goods-receipt.entity';

function receipt(overrides: Record<string, unknown> = {}): GoodsReceiptEntity {
  return {
    documentNumber: 'NK000383',
    receivedAt: new Date(2026, 6, 28, 22, 12),
    counterparty: { kind: 'EMPLOYEE', id: 'e1', code: null, name: 'CHÂU' },
    deliveredBy: 'A VINH',
    reason: 'Nhập hàng',
    description: 'HÀNG TOA 12/07/2026-CNDN 1 THUNG',
    branchId: 'branch-1',
    lines: [
      {
        item: {
          code: 'TH10520-D-35',
          name: 'Giày nữ TH10520-D-35',
          sellingPrice: 400000,
        },
        location: { name: 'B05.05', storageId: 'storage-1' },
        uomCode: 'Đôi',
        quantity: '2',
        unitPrice: '250000',
        lineTotal: '500000',
        note: 'ghi chú dòng',
      },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as GoodsReceiptEntity;
}

describe('mapGoodsReceiptToVoucherPayload', () => {
  it('uses the column set the reference voucher prints', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt(), null);

    expect(payload.lineColumns.map((c) => c.label)).toEqual([
      'STT',
      'Mã SKU',
      'Tên hàng hóa',
      'ĐVT',
      'Vị trí',
      'SL',
      'Đơn giá',
      'Thành tiền',
      'Giá bán',
      'Thành tiền giá bán',
      'Ghi chú',
    ]);
    // The receipt's warehouse is named in the branch block, not per line.
    expect(payload.lineColumns.map((c) => c.col)).not.toContain('warehouse');
  });

  it('spans the product name across four grid columns', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt(), null);
    const name = payload.lineColumns.find((c) => c.col === 'name');

    expect(name?.span).toBe(4);
  });

  it('carries the sale columns hidden, the way the reference does', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt(), null);
    const byCol = new Map(payload.lineColumns.map((c) => [c.col, c]));

    expect(byCol.get('salePrice')?.hidden).toBe(true);
    expect(byCol.get('saleTotal')?.hidden).toBe(true);
    // Everything else stays visible.
    expect(byCol.get('lineTotal')?.hidden).toBeUndefined();
  });

  it('fills the sale columns from the item price rather than leaving them zero', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt(), null);

    expect(payload.lines[0].salePrice).toBe(400000);
    expect(payload.lines[0].saleTotal).toBe(800000);
    expect(payload.totals?.saleTotal).toBe(800000);
    // A unit price has no meaningful sum.
    expect(payload.totals?.salePrice).toBeNull();
  });

  it('reads a missing selling price as zero, not NaN', () => {
    const payload = mapGoodsReceiptToVoucherPayload(
      receipt({
        lines: [
          {
            item: { code: 'X', name: 'X' },
            location: { name: 'A01' },
            uomCode: 'Đôi',
            quantity: '2',
            unitPrice: '1',
            lineTotal: '2',
          },
        ],
      }),
      null,
    );

    expect(payload.lines[0].salePrice).toBe(0);
    expect(payload.lines[0].saleTotal).toBe(0);
    expect(payload.totals?.saleTotal).toBe(0);
  });

  it('maps header fields, numbers the lines and sums totals', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt(), {
      name: 'Chi nhánh 211 TP. Đà Nẵng',
      address: '211 Lê Duẩn, Thanh Khê - Đà Nẵng',
      phone: null,
    });

    expect(payload.kind).toBe(VoucherKind.GOODS_RECEIPT);
    expect(payload.title).toBe('PHIẾU NHẬP KHO');
    expect(payload.docNo).toBe('NK000383');
    expect(payload.branch?.name).toBe('Chi nhánh 211 TP. Đà Nẵng');
    expect(payload.info).toContainEqual({ label: 'Đối tượng', value: 'CHÂU' });
    expect(payload.info).toContainEqual({
      label: 'Diễn giải',
      value: 'HÀNG TOA 12/07/2026-CNDN 1 THUNG',
    });
    expect(payload.lines[0]).toMatchObject({
      stt: 1,
      sku: 'TH10520-D-35',
      uom: 'Đôi',
      position: 'B05.05',
      quantity: 2,
      lineTotal: 500000,
      note: 'ghi chú dòng',
    });
    expect(payload.totals).toMatchObject({ quantity: 2, lineTotal: 500000 });
  });

  it('writes the document date the long way, without the leading word', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt(), null);

    expect(payload.docDate).toBe('28 tháng 7 năm 2026');
  });

  it('labels the totals row "Tổng" and reads the amount aloud', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt(), null);

    expect(payload.totalsLabel).toBe('Tổng');
    expect(payload.amountInWords).toBe('Năm trăm nghìn đồng chẵn.');
  });

  it('carries the five signature boxes the reference voucher has', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt(), null);

    expect(payload.signatures).toEqual([
      'Người lập phiếu',
      'Người nhận hàng',
      'Thủ kho',
      'Kế toán trưởng',
      'Giám đốc',
    ]);
  });

  it('adds the transfer source store line only when the receipt came from a transfer', () => {
    const fromTransfer = mapGoodsReceiptToVoucherPayload(
      receipt(),
      null,
      'Kho tổng',
    );
    expect(fromTransfer.info).toContainEqual({
      label: 'Cửa hàng xuất điều chuyển',
      value: 'Kho tổng',
    });

    const plain = mapGoodsReceiptToVoucherPayload(receipt(), null);
    expect(
      plain.info.some((row) => row.label === 'Cửa hàng xuất điều chuyển'),
    ).toBe(false);
  });

  it('falls back to a dash for missing info fields', () => {
    const payload = mapGoodsReceiptToVoucherPayload(
      receipt({ deliveredBy: undefined }),
      null,
    );

    expect(payload.branch).toBeNull();
    expect(payload.info).toContainEqual({ label: 'Người giao', value: '—' });
  });

  it('returns null totals and no amount in words when there are no lines', () => {
    const payload = mapGoodsReceiptToVoucherPayload(receipt({ lines: [] }), null);

    expect(payload.totals).toBeNull();
    expect(payload.amountInWords).toBeUndefined();
  });
});
