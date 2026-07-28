import {
  DocumentBranchInfo,
  ReportColumnDataType,
  ReportRow,
  VoucherKind,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import { GoodsIssueEntity } from './goods-issue.entity';

const LINE_COLUMNS = [
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING },
  { col: 'warehouse', label: 'Kho', type: ReportColumnDataType.STRING },
  { col: 'position', label: 'Vị trí', type: ReportColumnDataType.STRING },
  { col: 'quantity', label: 'Số lượng', type: ReportColumnDataType.NUMBER },
  { col: 'unitPrice', label: 'Đơn giá', type: ReportColumnDataType.CURRENCY },
  { col: 'lineTotal', label: 'Thành tiền', type: ReportColumnDataType.CURRENCY },
];

/**
 * Maps a `GoodsIssueEntity` (as returned by `GoodsIssueService.getById`) into a
 * `VoucherPrintPayload` (ADR-05, ADR-09). Pure — the caller resolves `branch` and
 * warehouse names before calling this, same contract as `mapGoodsReceiptToVoucherPayload`.
 */
export function mapGoodsIssueToVoucherPayload(
  issue: GoodsIssueEntity,
  branch: DocumentBranchInfo | null,
  storageNameByStorageId: Map<string, string>,
): VoucherPrintPayload {
  const lines: ReportRow[] = issue.lines.map((line) => ({
    sku: line.item?.code ?? null,
    name: line.item?.name ?? null,
    warehouse: storageNameByStorageId.get(line.location?.storageId ?? '') ?? null,
    position: line.location?.name ?? null,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    lineTotal: Number(line.lineTotal),
  }));

  const totals: ReportRow = {
    sku: null,
    name: null,
    warehouse: null,
    position: null,
    quantity: lines.reduce((sum, l) => sum + (l.quantity as number), 0),
    unitPrice: null,
    lineTotal: lines.reduce((sum, l) => sum + (l.lineTotal as number), 0),
  };

  return {
    kind: VoucherKind.GOODS_ISSUE,
    paper: 'A4',
    title: 'PHIẾU XUẤT KHO',
    docNo: issue.documentNumber ?? '',
    docDate: (issue.occurredAt ?? issue.createdAt).toLocaleDateString('vi-VN'),
    branch,
    info: [
      { label: 'Đối tượng', value: issue.counterparty?.name ?? '—' },
      { label: 'Người giao', value: issue.deliverer ?? '—' },
      { label: 'Diễn giải', value: issue.reason ?? issue.notes ?? '—' },
    ],
    lineColumns: LINE_COLUMNS,
    lines,
    totals: lines.length ? totals : null,
    signatures: ['Người giao hàng', 'Người nhận hàng', 'Thủ kho'],
  };
}
