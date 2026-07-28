import {
  DocumentBranchInfo,
  ReportColumnDataType,
  ReportRow,
  VoucherKind,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import { GoodsReceiptEntity } from './goods-receipt.entity';

const LINE_COLUMNS = [
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING },
  { col: 'warehouse', label: 'Kho', type: ReportColumnDataType.STRING },
  { col: 'position', label: 'Vị trí', type: ReportColumnDataType.STRING },
  { col: 'uom', label: 'Đơn vị tính', type: ReportColumnDataType.STRING },
  { col: 'quantity', label: 'Số lượng', type: ReportColumnDataType.NUMBER },
  { col: 'unitPrice', label: 'Đơn giá', type: ReportColumnDataType.CURRENCY },
  { col: 'lineTotal', label: 'Thành tiền', type: ReportColumnDataType.CURRENCY },
];

/**
 * Maps a `GoodsReceiptEntity` (as returned by `GoodsReceiptService.getById`, already
 * carrying resolved `counterparty` and eager `lines`/`item`/`location`) into a
 * `VoucherPrintPayload` (ADR-05, ADR-09). Pure — the caller resolves `branch` and
 * warehouse names (`loadVoucherBranch`/`loadStorageNames`) before calling this.
 */
export function mapGoodsReceiptToVoucherPayload(
  receipt: GoodsReceiptEntity,
  branch: DocumentBranchInfo | null,
  storageNameByStorageId: Map<string, string>,
): VoucherPrintPayload {
  const lines: ReportRow[] = receipt.lines.map((line) => ({
    sku: line.item?.code ?? null,
    name: line.item?.name ?? null,
    warehouse: storageNameByStorageId.get(line.location?.storageId ?? '') ?? null,
    position: line.location?.name ?? null,
    uom: line.uomCode ?? null,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    lineTotal: Number(line.lineTotal),
  }));

  const totals: ReportRow = {
    sku: null,
    name: null,
    warehouse: null,
    position: null,
    uom: null,
    quantity: lines.reduce((sum, l) => sum + (l.quantity as number), 0),
    unitPrice: null,
    lineTotal: lines.reduce((sum, l) => sum + (l.lineTotal as number), 0),
  };

  return {
    kind: VoucherKind.GOODS_RECEIPT,
    paper: 'A4',
    title: 'PHIẾU NHẬP KHO',
    docNo: receipt.documentNumber ?? '',
    docDate: receipt.receivedAt.toLocaleDateString('vi-VN'),
    branch,
    info: [
      { label: 'Đối tượng', value: receipt.counterparty?.name ?? '—' },
      { label: 'Người giao', value: receipt.deliveredBy ?? '—' },
      { label: 'Lý do', value: receipt.reason ?? '—' },
      { label: 'Diễn giải', value: receipt.description ?? '—' },
    ],
    lineColumns: LINE_COLUMNS,
    lines,
    totals: lines.length ? totals : null,
    signatures: ['Người giao hàng', 'Người nhận hàng', 'Thủ kho'],
  };
}
