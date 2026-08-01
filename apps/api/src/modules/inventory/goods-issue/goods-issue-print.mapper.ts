import {
  DocumentBranchInfo,
  ReportColumnDataType,
  ReportRow,
  VoucherKind,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import { amountInWordsVi } from '../../../common/utils/amount-in-words.util';
import { toLongVietnameseDate } from '../../../common/utils/document-date.util';
import { VOUCHER_COLUMN_WIDTHS } from '../voucher-column-width.const';
import { GoodsIssueEntity } from './goods-issue.entity';

/**
 * Columns as the reference voucher prints them
 * (`examples/ERP/export_Xuat_Khau_Xuat_Kho.xlsx`) — same shape as the goods
 * receipt, with the full "Số lượng" label the reference uses on an issue.
 *
 * Unit comes off the item: unlike `GoodsReceiptLineEntity`, a goods issue line
 * has no `uomCode` of its own.
 *
 * "Ghi chú" is hidden: on the spreadsheet, off the printed slip.
 */
const W = VOUCHER_COLUMN_WIDTHS;

const LINE_COLUMNS = [
  { col: 'stt', label: 'STT', type: ReportColumnDataType.NUMBER, align: 'center' as const, width: W.stt },
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING, width: W.sku },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING, span: 4, width: W.name },
  { col: 'uom', label: 'ĐVT', type: ReportColumnDataType.STRING, width: W.uom },
  { col: 'position', label: 'Vị trí', type: ReportColumnDataType.STRING, width: W.position },
  { col: 'quantity', label: 'Số lượng', type: ReportColumnDataType.NUMBER, width: W.quantity },
  { col: 'unitPrice', label: 'Đơn giá', type: ReportColumnDataType.CURRENCY, width: W.unitPrice },
  { col: 'lineTotal', label: 'Thành tiền', type: ReportColumnDataType.CURRENCY, width: W.lineTotal },
  { col: 'salePrice', label: 'Giá bán', type: ReportColumnDataType.CURRENCY, hidden: true, width: W.salePrice },
  {
    col: 'saleTotal',
    label: 'Thành tiền giá bán',
    type: ReportColumnDataType.CURRENCY,
    hidden: true,
    width: W.saleTotal,
  },
  { col: 'note', label: 'Ghi chú', type: ReportColumnDataType.STRING, hidden: true, width: W.note },
];

const SIGNATURES = [
  'Người lập phiếu',
  'Người nhận hàng',
  'Thủ kho',
  'Kế toán trưởng',
  'Giám đốc',
];

/**
 * Maps a `GoodsIssueEntity` (as returned by `GoodsIssueService.getById`) into a
 * `VoucherPrintPayload` (ADR-05, ADR-10). Pure — the caller resolves `branch` and,
 * when the issue is the outbound leg of a transfer, the destination store name,
 * before calling this. Same contract as `mapGoodsReceiptToVoucherPayload`.
 */
export function mapGoodsIssueToVoucherPayload(
  issue: GoodsIssueEntity,
  branch: DocumentBranchInfo | null,
  transferDestinationStoreName?: string | null,
): VoucherPrintPayload {
  const lines: ReportRow[] = issue.lines.map((line, index) => {
    const quantity = Number(line.quantity);
    const salePrice = Number(line.item?.sellingPrice ?? 0);
    return {
      stt: index + 1,
      sku: line.item?.code ?? null,
      name: line.item?.name ?? null,
      uom: line.item?.unit ?? null,
      position: line.location?.name ?? null,
      quantity,
      unitPrice: Number(line.unitPrice),
      lineTotal: Number(line.lineTotal),
      salePrice,
      saleTotal: salePrice * quantity,
      note: line.notes ?? null,
    };
  });

  const sum = (key: string): number =>
    lines.reduce((acc, l) => acc + (l[key] as number), 0);
  const totalAmount = sum('lineTotal');

  const totals: ReportRow = {
    stt: null,
    sku: null,
    name: null,
    uom: null,
    position: null,
    quantity: sum('quantity'),
    unitPrice: null,
    lineTotal: totalAmount,
    salePrice: null,
    saleTotal: sum('saleTotal'),
    note: null,
  };

  const info = [
    { label: 'Đối tượng', value: issue.counterparty?.name ?? '—' },
    { label: 'Người giao', value: issue.deliverer ?? '—' },
    { label: 'Diễn giải', value: issue.reason ?? issue.notes ?? '—' },
  ];
  if (transferDestinationStoreName) {
    info.push({
      label: 'Cửa hàng nhận điều chuyển',
      value: transferDestinationStoreName,
    });
  }

  return {
    kind: VoucherKind.GOODS_ISSUE,
    paper: 'A4',
    title: 'PHIẾU XUẤT KHO',
    docNo: issue.documentNumber ?? '',
    docDate: toLongVietnameseDate(issue.occurredAt ?? issue.createdAt),
    branch,
    info,
    lineColumns: LINE_COLUMNS,
    lines,
    totals: lines.length ? totals : null,
    // The reference issue voucher says "Cộng" where the receipt says "Tổng".
    totalsLabel: 'Cộng',
    amountInWords: lines.length ? amountInWordsVi(totalAmount) : undefined,
    signatures: SIGNATURES,
  };
}
