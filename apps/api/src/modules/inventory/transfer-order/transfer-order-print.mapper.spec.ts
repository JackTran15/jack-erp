import { VoucherKind } from '@erp/shared-interfaces';
import { mapTransferOrderToVoucherPayload } from './transfer-order-print.mapper';
import { TransferOrderEntity } from './transfer-order.entity';

function order(overrides: Record<string, unknown> = {}): TransferOrderEntity {
  return {
    documentNumber: 'LDC000001',
    createdAt: new Date('2026-07-09T00:00:00Z'),
    sourceBranchId: 'branch-hcm',
    destinationBranchId: 'branch-hn',
    sourceStorageId: 'storage-hcm',
    destinationStorageId: 'storage-hn',
    notes: null,
    lines: [
      {
        item: { code: 'ABA2777-D-38', name: 'Giày nam ABA2777-D-38', unit: 'Đôi' },
        sourceStorageId: null,
        sourceLocationCode: 'A01.01',
        requestedQty: '3',
      },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as TransferOrderEntity;
}

describe('mapTransferOrderToVoucherPayload', () => {
  it('maps header fields and resolves the header-level source warehouse for a line with no override', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order(),
      { name: 'Hồ Chí Minh', address: null, phone: null },
      'Hà Nội',
      new Map([
        ['storage-hcm', 'Kho lưu trữ HCM'],
        ['storage-hn', 'Kho lưu trữ HN'],
      ]),
    );

    expect(payload.kind).toBe(VoucherKind.TRANSFER_ORDER);
    expect(payload.title).toBe('LỆNH ĐIỀU CHUYỂN');
    expect(payload.info).toContainEqual({ label: 'Điều chuyển từ', value: 'Hồ Chí Minh' });
    expect(payload.info).toContainEqual({ label: 'Đến', value: 'Hà Nội' });
    expect(payload.lines[0]).toMatchObject({
      sku: 'ABA2777-D-38',
      warehouse: 'Kho lưu trữ HCM',
      position: 'A01.01',
      uom: 'Đôi',
      quantity: 3,
    });
    expect(payload.totals).toMatchObject({ quantity: 3 });
    expect(payload.lineColumns.map((c) => c.col)).not.toContain('unitPrice');
  });

  it('prefers a per-line source storage override over the header source', () => {
    const payload = mapTransferOrderToVoucherPayload(
      order({ lines: [{ item: { code: 'X', name: 'X', unit: 'cái' }, sourceStorageId: 'storage-other', sourceLocationCode: 'B01', requestedQty: '1' }] }),
      null,
      'Hà Nội',
      new Map([
        ['storage-hcm', 'Kho lưu trữ HCM'],
        ['storage-other', 'Kho khác'],
      ]),
    );
    expect(payload.lines[0].warehouse).toBe('Kho khác');
  });

  it('returns null totals when there are no lines', () => {
    const payload = mapTransferOrderToVoucherPayload(order({ lines: [] }), null, '', new Map());
    expect(payload.totals).toBeNull();
  });
});
