import {
  DocumentBranchInfo,
  ReportColumnDataType,
  ReportRow,
  VoucherKind,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import { TransferOrderEntity } from './transfer-order.entity';

const LINE_COLUMNS = [
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING },
  { col: 'warehouse', label: 'Kho', type: ReportColumnDataType.STRING },
  { col: 'position', label: 'Vị trí', type: ReportColumnDataType.STRING },
  { col: 'uom', label: 'Đơn vị tính', type: ReportColumnDataType.STRING },
  { col: 'quantity', label: 'Số lượng', type: ReportColumnDataType.NUMBER },
];

/**
 * Maps a `TransferOrderEntity` (as returned by `TransferOrderService.getById`) into a
 * `VoucherPrintPayload` (ADR-05, ADR-09). Pure — the caller resolves `sourceBranch`,
 * `destinationBranch` and warehouse names before calling this.
 *
 * Unlike goods-receipt/issue, a transfer line carries no price — `TransferOrderLineEntity`
 * has no `unitPrice`/`lineTotal` column, so `totals` only sums quantity.
 */
export function mapTransferOrderToVoucherPayload(
  order: TransferOrderEntity,
  sourceBranch: DocumentBranchInfo | null,
  destinationBranchName: string,
  storageNameByStorageId: Map<string, string>,
): VoucherPrintPayload {
  const lines: ReportRow[] = order.lines.map((line) => {
    const storageId = line.sourceStorageId ?? order.sourceStorageId;
    return {
      sku: line.item?.code ?? null,
      name: line.item?.name ?? null,
      warehouse: storageNameByStorageId.get(storageId ?? '') ?? null,
      position: line.sourceLocationCode ?? null,
      uom: line.item?.unit ?? null,
      quantity: Number(line.requestedQty),
    };
  });

  const totals: ReportRow = {
    sku: null,
    name: null,
    warehouse: null,
    position: null,
    uom: null,
    quantity: lines.reduce((sum, l) => sum + (l.quantity as number), 0),
  };

  return {
    kind: VoucherKind.TRANSFER_ORDER,
    paper: 'A4',
    title: 'LỆNH ĐIỀU CHUYỂN',
    docNo: order.documentNumber ?? '',
    docDate: order.createdAt.toLocaleDateString('vi-VN'),
    branch: sourceBranch,
    info: [
      { label: 'Điều chuyển từ', value: sourceBranch?.name ?? '—' },
      { label: 'Đến', value: destinationBranchName || '—' },
      { label: 'Lý do', value: order.notes ?? '—' },
    ],
    lineColumns: LINE_COLUMNS,
    lines,
    totals: lines.length ? totals : null,
    signatures: ['Người giao hàng', 'Người nhận hàng', 'Thủ kho'],
  };
}
