import { VoucherKind } from '@erp/shared-interfaces';
import { amountInWordsVi } from '../../../common/utils/amount-in-words.util';
import { mapStockTransferToVoucherPayload } from './stock-transfer-print.mapper';
import { StockTransferEntity } from './stock-transfer.entity';

function transfer(overrides: Record<string, unknown> = {}): StockTransferEntity {
  return {
    documentNumber: 'CK104260',
    createdAt: new Date(2026, 4, 6),
    transferredAt: new Date(2026, 4, 7),
    sourceBranchId: 'branch-mt',
    destinationBranchId: 'branch-mt',
    notes: 'HÀNG TRẢ QUẦY NGÀY 07/05/2026',
    counterparty: { kind: 'employee', id: 'nv-1', code: 'NV001', name: 'NGUYỄN NHỰT HÀO' },
    transporter: { id: 'u-1', fullName: 'Người vận chuyển cũ' },
    lines: [
      {
        item: {
          code: 'TN0743-D-42',
          name: 'Giày nam TN0743-D-42',
          unit: 'Đôi',
          sellingPrice: 450000,
        },
        sourceStorage: { name: 'SRMT' },
        sourceLocation: { name: 'Kệ S1' },
        destinationStorage: { name: 'KHOMT' },
        destinationLocation: { name: 'G46.03' },
        quantity: '2',
        unitPrice: '330000.00',
        lineValue: '660000.00',
        notes: null,
      },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as StockTransferEntity;
}

const BRANCH = {
  name: 'Chi nhánh Mậu Thân - CT',
  address: '62, Mậu Thân, Xuân Khánh, Ninh Kiều, Cần Thơ',
  phone: null,
};

describe('mapStockTransferToVoucherPayload', () => {
  it('is titled the way the reference voucher is', () => {
    const payload = mapStockTransferToVoucherPayload(transfer(), BRANCH);

    expect(payload.kind).toBe(VoucherKind.STOCK_TRANSFER);
    expect(payload.paper).toBe('A4');
    expect(payload.title).toBe('PHIẾU CHUYỂN KHO');
    expect(payload.docNo).toBe('CK104260');
    expect(payload.docDate).toBe('7 tháng 5 năm 2026');
    expect(payload.branch).toEqual(BRANCH);
  });

  it('uses the column set the reference voucher prints, sale columns hidden', () => {
    const payload = mapStockTransferToVoucherPayload(transfer(), BRANCH);

    expect(payload.lineColumns.map((c) => c.label)).toEqual([
      'STT',
      'Mã SKU',
      'Tên hàng hóa',
      'Kho xuất',
      'Vị trí xuất',
      'Kho nhập',
      'Vị trí nhập',
      'ĐVT',
      'Số lượng',
      'Đơn giá',
      'Thành tiền',
      'Giá bán',
      'Thành tiền giá bán',
      'Ghi chú',
    ]);
    expect(
      payload.lineColumns.filter((c) => c.hidden).map((c) => c.col),
    ).toEqual(['salePrice', 'saleTotal', 'note']);
    expect(payload.lineColumns.find((c) => c.col === 'name')?.span).toBe(4);
    expect(payload.lineColumns.every((c) => typeof c.width === 'number')).toBe(true);
  });

  it('fills each line from the line relations, not the header', () => {
    const payload = mapStockTransferToVoucherPayload(transfer(), BRANCH);

    expect(payload.lines).toEqual([
      {
        stt: 1,
        sku: 'TN0743-D-42',
        name: 'Giày nam TN0743-D-42',
        sourceWarehouse: 'SRMT',
        sourcePosition: 'Kệ S1',
        destWarehouse: 'KHOMT',
        destPosition: 'G46.03',
        uom: 'Đôi',
        quantity: 2,
        unitPrice: 330000,
        lineTotal: 660000,
        salePrice: 450000,
        saleTotal: 900000,
        note: null,
      },
    ]);
  });

  it('derives the line total from the unit price when lineValue is missing', () => {
    const payload = mapStockTransferToVoucherPayload(
      transfer({
        lines: [
          {
            item: { code: 'A', name: 'A', unit: 'Cái', sellingPrice: 0 },
            quantity: '3',
            unitPrice: '100.00',
            lineValue: null,
          },
        ],
      }),
      BRANCH,
    );

    expect(payload.lines[0].lineTotal).toBe(300);
    expect(payload.lines[0].sourceWarehouse).toBeNull();
    expect(payload.lines[0].destPosition).toBeNull();
  });

  it('totals quantity and amount, and writes the amount in words', () => {
    const payload = mapStockTransferToVoucherPayload(transfer(), BRANCH);

    expect(payload.totalsLabel).toBe('Tổng');
    expect(payload.totals).toMatchObject({
      quantity: 2,
      lineTotal: 660000,
      saleTotal: 900000,
      unitPrice: null,
      sku: null,
    });
    expect(payload.amountInWords).toBe(amountInWordsVi(660000));
    expect(payload.signatures).toEqual([
      'Người lập phiếu',
      'Người nhận hàng',
      'Thủ kho',
      'Kế toán trưởng',
      'Giám đốc',
    ]);
  });

  it('prints the counterparty as the transporter, and the description', () => {
    const payload = mapStockTransferToVoucherPayload(transfer(), BRANCH);

    expect(payload.info).toEqual([
      { label: 'Người vận chuyển', value: 'NGUYỄN NHỰT HÀO' },
      { label: 'Diễn giải', value: 'HÀNG TRẢ QUẦY NGÀY 07/05/2026' },
    ]);
  });

  it('falls back to the legacy transporter user, then to a dash', () => {
    const legacy = mapStockTransferToVoucherPayload(
      transfer({ counterparty: null, notes: null }),
      BRANCH,
    );
    expect(legacy.info).toEqual([
      { label: 'Người vận chuyển', value: 'Người vận chuyển cũ' },
      { label: 'Diễn giải', value: '—' },
    ]);

    const bare = mapStockTransferToVoucherPayload(
      transfer({ counterparty: null, transporter: null }),
      BRANCH,
    );
    expect(bare.info[0].value).toBe('—');
  });

  it('dates the voucher by transferredAt, falling back to createdAt', () => {
    const payload = mapStockTransferToVoucherPayload(
      transfer({ transferredAt: null }),
      BRANCH,
    );
    expect(payload.docDate).toBe('6 tháng 5 năm 2026');
  });

  it('has no totals and no amount in words on an empty voucher', () => {
    const payload = mapStockTransferToVoucherPayload(transfer({ lines: [] }), null);

    expect(payload.lines).toEqual([]);
    expect(payload.totals).toBeNull();
    expect(payload.amountInWords).toBeUndefined();
    expect(payload.branch).toBeNull();
  });
});
