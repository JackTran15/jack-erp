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
import { StockTransferEntity } from './stock-transfer.entity';

/**
 * Columns as the reference voucher prints them (MISA "Phiếu chuyển kho",
 * `XuatKhauChuyenKho.xlsx`). Unlike a transfer *order*, a stock transfer line
 * carries a destination storage/location and a unit price, so every column of
 * the reference can be filled and the voucher gets an amount-in-words line.
 *
 * "Serials" is not a column: the system does not track serial numbers.
 *
 * The two sale columns and "Ghi chú" are present but hidden, as on the goods
 * issue: on the spreadsheet, off the printed slip.
 */
/**
 * Eleven columns reach paper here, against seven or eight on the other stock
 * vouchers, and the printed page normalises these widths into shares of the
 * same 190 mm (ADR-13). At the shared numbers the narrow columns starve: "STT"
 * and "ĐVT" break mid-word and a seven-digit unit price wraps its last digit.
 * So the text columns — "Mã SKU", "Tên hàng hóa" and the warehouse / position
 * names, which the reference voucher wraps anyway — give up a few characters,
 * and the headings and money columns get enough to stay whole. A 16-character
 * SKU wraps here where it fits on the other vouchers. "Tên hàng hóa" keeps
 * 9 per grid column because the spreadsheet's signature boxes land on two of
 * those columns each ("Người nhận hàng" needs about 18).
 * The spreadsheet reads the same numbers as absolute widths, where every one
 * of these still fits its content.
 */
const W: Readonly<Record<string, number>> = {
  ...VOUCHER_COLUMN_WIDTHS,
  stt: 9,
  sku: 20,
  name: 9,
  sourceWarehouse: 14,
  sourcePosition: 11,
  destWarehouse: 14,
  destPosition: 11,
  uom: 10,
  unitPrice: 14,
};

const LINE_COLUMNS = [
  { col: 'stt', label: 'STT', type: ReportColumnDataType.NUMBER, align: 'center' as const, width: W.stt },
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING, width: W.sku },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING, span: 4, width: W.name },
  { col: 'sourceWarehouse', label: 'Kho xuất', type: ReportColumnDataType.STRING, width: W.sourceWarehouse },
  { col: 'sourcePosition', label: 'Vị trí xuất', type: ReportColumnDataType.STRING, width: W.sourcePosition },
  { col: 'destWarehouse', label: 'Kho nhập', type: ReportColumnDataType.STRING, width: W.destWarehouse },
  { col: 'destPosition', label: 'Vị trí nhập', type: ReportColumnDataType.STRING, width: W.destPosition },
  { col: 'uom', label: 'ĐVT', type: ReportColumnDataType.STRING, width: W.uom },
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
 * Maps a `StockTransferEntity` (as returned by `StockTransferService.getById`,
 * carrying the resolved `counterparty` / `transporter` and eager `lines` with
 * `item`, storages and locations) into a `VoucherPrintPayload`. Pure — the
 * caller resolves `sourceBranch` before calling this. Same contract as
 * `mapGoodsIssueToVoucherPayload`.
 *
 * "Người vận chuyển" is the Đối tượng; legacy transfers without one fall back
 * to the transporter user, the same way the list page renders them.
 */
export function mapStockTransferToVoucherPayload(
  transfer: StockTransferEntity,
  sourceBranch: DocumentBranchInfo | null,
): VoucherPrintPayload {
  const lines: ReportRow[] = transfer.lines.map((line, index) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice ?? 0);
    // The stored total is authoritative; the product is only a fallback for
    // legacy lines, rounded so binary float noise never reaches amountInWords.
    const lineTotal =
      line.lineValue != null
        ? Number(line.lineValue)
        : Math.round(unitPrice * quantity * 100) / 100;
    const salePrice = Number(line.item?.sellingPrice ?? 0);
    return {
      stt: index + 1,
      sku: line.item?.code ?? null,
      name: line.item?.name ?? null,
      sourceWarehouse: line.sourceStorage?.name ?? null,
      sourcePosition: line.sourceLocation?.name ?? null,
      destWarehouse: line.destinationStorage?.name ?? null,
      destPosition: line.destinationLocation?.name ?? null,
      uom: line.item?.unit ?? null,
      quantity,
      unitPrice,
      lineTotal,
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
    sourceWarehouse: null,
    sourcePosition: null,
    destWarehouse: null,
    destPosition: null,
    uom: null,
    quantity: sum('quantity'),
    unitPrice: null,
    lineTotal: totalAmount,
    salePrice: null,
    saleTotal: sum('saleTotal'),
    note: null,
  };

  const transporterName =
    transfer.counterparty?.name ?? transfer.transporter?.fullName ?? '—';

  return {
    kind: VoucherKind.STOCK_TRANSFER,
    paper: 'A4',
    title: 'PHIẾU CHUYỂN KHO',
    docNo: transfer.documentNumber ?? '',
    docDate: toLongVietnameseDate(transfer.transferredAt ?? transfer.createdAt),
    branch: sourceBranch,
    info: [
      { label: 'Người vận chuyển', value: transporterName },
      { label: 'Diễn giải', value: transfer.notes ?? '—' },
    ],
    lineColumns: LINE_COLUMNS,
    lines,
    totals: lines.length ? totals : null,
    totalsLabel: 'Tổng',
    amountInWords: lines.length ? amountInWordsVi(totalAmount) : undefined,
    signatures: SIGNATURES,
  };
}
