import { VoucherKind } from '@erp/shared-interfaces';
import { mapTransferOrderToVoucherPayload } from './transfer-order-print.mapper';
import { TransferOrderEntity } from './transfer-order.entity';

function order(overrides: Record<string, unknown> = {}): TransferOrderEntity {
  return {
    documentNumber: 'CK104265',
    createdAt: new Date(2026, 6, 1),
    sourceBranchId: 'branch-hcm',
    destinationBranchId: 'branch-hn',
    sourceStorageId: 'storage-hcm',
    destinationStorageId: 'storage-hn',
    notes: null,
    lines: [
      {
        item: {
          code: 'ABA2777-D-38',
          name: 'Giày nam ABA2777-D-38',
          unit: 'Đôi',
          sellingPrice: 400000,
        },
        sourceStorageId: null,
        sourceLocationCode: 'A01.01',
        requestedQty: '3',
        note: null,
      },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as TransferOrderEntity;
}

const STORAGES = new Map([
  ['storage-hcm', 'Kho lưu trữ HCM'],
  ['storage-hn', 'Kho lưu trữ HN'],
]);

describe('mapTransferOrderToVoucherPayload', () => {
  it('is titled the way the reference voucher is', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      null,
      'Hà Nội',
      STORAGES,
    );

    expect(payload.kind).toBe(VoucherKind.TRANSFER_ORDER);
    expect(payload.title).toBe('PHIẾU CHUYỂN KHO');
  });

  it('uses the column set the reference voucher prints, minus what has no data', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      null,
      'Hà Nội',
      STORAGES,
    );

    expect(payload.lineColumns.map((c) => c.label)).toEqual([
      'STT',
      'Mã SKU',
      'Tên hàng hóa',
      'Kho xuất',
      'Vị trí xuất',
      'Kho nhập',
      'ĐVT',
      'SL',
      'Giá bán',
      'Thành tiền giá bán',
      'Ghi chú',
    ]);
    // A transfer line carries no cost price, so these have nothing to show (A-20).
    expect(payload.lineColumns.map((c) => c.col)).not.toContain('unitPrice');
    expect(payload.lineColumns.map((c) => c.col)).not.toContain('lineTotal');
    // And there is no destination location on a line (A-21).
    expect(payload.lineColumns.map((c) => c.col)).not.toContain('destPosition');
  });

  it('spans the product name and hides the sale columns, like the other vouchers', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      null,
      'Hà Nội',
      STORAGES,
    );
    const byCol = new Map(payload.lineColumns.map((c) => [c.col, c]));

    expect(byCol.get('name')?.span).toBe(4);
    expect(byCol.get('salePrice')?.hidden).toBe(true);
    expect(byCol.get('saleTotal')?.hidden).toBe(true);
  });

  it('fills the sale columns even though the line has no cost price', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      null,
      'Hà Nội',
      STORAGES,
    );

    expect(payload.lines[0].salePrice).toBe(400000);
    expect(payload.lines[0].saleTotal).toBe(1200000);
    expect(payload.totals?.saleTotal).toBe(1200000);
    expect(payload.totals?.salePrice).toBeNull();
  });

  it('resolves the header-level source warehouse for a line with no override', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      { name: 'Hồ Chí Minh', address: null, phone: null },
      'Hà Nội',
      STORAGES,
    );

    expect(payload.info).toContainEqual({
      label: 'Điều chuyển từ',
      value: 'Hồ Chí Minh',
    });
    expect(payload.info).toContainEqual({ label: 'Đến', value: 'Hà Nội' });
    expect(payload.lines[0]).toMatchObject({
      stt: 1,
      sku: 'ABA2777-D-38',
      sourceWarehouse: 'Kho lưu trữ HCM',
      sourcePosition: 'A01.01',
      destWarehouse: 'Kho lưu trữ HN',
      uom: 'Đôi',
      quantity: 3,
    });
    expect(payload.totals).toMatchObject({ quantity: 3 });
  });

  it('prefers a per-line source storage override over the header source', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order({
        lines: [
          {
            item: { code: 'X', name: 'X', unit: 'cái' },
            sourceStorageId: 'storage-other',
            sourceLocationCode: 'B01',
            requestedQty: '1',
          },
        ],
      }),
      null,
      'Hà Nội',
      new Map([
        ['storage-hcm', 'Kho lưu trữ HCM'],
        ['storage-other', 'Kho khác'],
      ]),
    );

    expect(payload.lines[0].sourceWarehouse).toBe('Kho khác');
  });

  it('falls back to the destination branch name when its storage is unresolved', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      null,
      'Hà Nội',
      new Map([['storage-hcm', 'Kho lưu trữ HCM']]),
    );

    expect(payload.lines[0].destWarehouse).toBe('Hà Nội');
  });

  it('carries no amount in words — a transfer line has no price', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      null,
      'Hà Nội',
      STORAGES,
    );

    expect(payload.amountInWords).toBeUndefined();
    expect(payload.totalsLabel).toBe('Tổng');
  });

  it('carries the five signature boxes', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      null,
      'Hà Nội',
      STORAGES,
    );

    expect(payload.signatures).toHaveLength(5);
  });

  it('writes the document date the long way', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      null,
      'Hà Nội',
      STORAGES,
    );

    expect(payload.docDate).toBe('1 tháng 7 năm 2026');
  });

  it('returns null totals when there are no lines', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order({ lines: [] }),
      null,
      '',
      new Map(),
    );

    expect(payload.totals).toBeNull();
  });
});
