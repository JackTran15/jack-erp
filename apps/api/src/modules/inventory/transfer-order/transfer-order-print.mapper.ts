import {
  DocumentBranchInfo,
  ReportColumnDataType,
  ReportRow,
  VoucherKind,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import { toLongVietnameseDate } from '../../../common/utils/document-date.util';
import { TransferOrderEntity } from './transfer-order.entity';

/**
 * Columns as the reference voucher prints them
 * (`examples/ERP/export_XuatKhauChuyenKho.xlsx`), minus what the data model
 * cannot fill (A-20/A-21):
 *
 *  - "Vị trí nhập": `TransferOrderLineEntity` has a source location but no
 *    destination one, so there is nothing to print;
 *  - "Đơn giá" / "Thành tiền": a transfer line carries no cost price, which is
 *    also why this voucher has no amount-in-words line.
 *
 * The two sale columns are present but hidden, as in the reference, and carry
 * the item's default selling price (A-24) — that is catalogue data, unrelated
 * to the missing per-line cost.
 *
 * "Kho nhập" comes off the order, not the line — the destination is a
 * document-level field today.
 */
const LINE_COLUMNS = [
  { col: 'stt', label: 'STT', type: ReportColumnDataType.NUMBER, align: 'center' as const },
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING, span: 4 },
  { col: 'sourceWarehouse', label: 'Kho xuất', type: ReportColumnDataType.STRING },
  { col: 'sourcePosition', label: 'Vị trí xuất', type: ReportColumnDataType.STRING },
  { col: 'destWarehouse', label: 'Kho nhập', type: ReportColumnDataType.STRING },
  { col: 'uom', label: 'ĐVT', type: ReportColumnDataType.STRING },
  { col: 'quantity', label: 'SL', type: ReportColumnDataType.NUMBER },
  { col: 'salePrice', label: 'Giá bán', type: ReportColumnDataType.CURRENCY, hidden: true },
  {
    col: 'saleTotal',
    label: 'Thành tiền giá bán',
    type: ReportColumnDataType.CURRENCY,
    hidden: true,
  },
  { col: 'note', label: 'Ghi chú', type: ReportColumnDataType.STRING },
];

const SIGNATURES = [
  'Người lập phiếu',
  'Người nhận hàng',
  'Thủ kho',
  'Kế toán trưởng',
  'Giám đốc',
];

/**
 * Maps a `TransferOrderEntity` (as returned by `TransferOrderService.getById`) into a
 * `VoucherPrintPayload` (ADR-05, ADR-10). Pure — the caller resolves `sourceBranch`,
 * `destinationBranch` and warehouse names before calling this.
 *
 * Titled "PHIẾU CHUYỂN KHO" after the reference voucher, not "LỆNH ĐIỀU CHUYỂN".
 */
export function mapTransferOrderToVoucherPayload(
  order: TransferOrderEntity,
  sourceBranch: DocumentBranchInfo | null,
  destinationBranchName: string,
  storageNameByStorageId: Map<string, string>,
): VoucherPrintPayload {
  const destWarehouse =
    storageNameByStorageId.get(order.destinationStorageId ?? '') ??
    destinationBranchName ??
    null;

  const lines: ReportRow[] = order.lines.map((line, index) => {
    const storageId = line.sourceStorageId ?? order.sourceStorageId;
    const quantity = Number(line.requestedQty);
    const salePrice = Number(line.item?.sellingPrice ?? 0);
    return {
      stt: index + 1,
      sku: line.item?.code ?? null,
      name: line.item?.name ?? null,
      sourceWarehouse: storageNameByStorageId.get(storageId ?? '') ?? null,
      sourcePosition: line.sourceLocationCode ?? null,
      destWarehouse,
      uom: line.item?.unit ?? null,
      quantity,
      salePrice,
      saleTotal: salePrice * quantity,
      note: line.note ?? null,
    };
  });

  const sum = (key: string): number =>
    lines.reduce((acc, l) => acc + (l[key] as number), 0);

  const totals: ReportRow = {
    stt: null,
    sku: null,
    name: null,
    sourceWarehouse: null,
    sourcePosition: null,
    destWarehouse: null,
    uom: null,
    quantity: sum('quantity'),
    salePrice: null,
    saleTotal: sum('saleTotal'),
    note: null,
  };

  return {
    kind: VoucherKind.TRANSFER_ORDER,
    paper: 'A4',
    title: 'PHIẾU CHUYỂN KHO',
    docNo: order.documentNumber ?? '',
    docDate: toLongVietnameseDate(order.createdAt),
    branch: sourceBranch,
    info: [
      { label: 'Điều chuyển từ', value: sourceBranch?.name ?? '—' },
      { label: 'Đến', value: destinationBranchName || '—' },
      { label: 'Diễn giải', value: order.notes ?? '—' },
    ],
    lineColumns: LINE_COLUMNS,
    lines,
    totals: lines.length ? totals : null,
    totalsLabel: 'Tổng',
    signatures: SIGNATURES,
  };
}
