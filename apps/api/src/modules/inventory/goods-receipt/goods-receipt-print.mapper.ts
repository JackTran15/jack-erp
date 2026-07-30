import {
  DocumentBranchInfo,
  ReportColumnDataType,
  ReportRow,
  VoucherKind,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import { amountInWordsVi } from '../../../common/utils/amount-in-words.util';
import { toLongVietnameseDate } from '../../../common/utils/document-date.util';
import { GoodsReceiptEntity } from './goods-receipt.entity';

/**
 * Columns as the reference voucher prints them
 * (`examples/ERP/export_Phieu_nhap_kho.xlsx`). No "Kho" column: a goods receipt
 * lands in one warehouse, which the branch block above the table already names.
 *
 * "Tên hàng hóa" spans four grid columns and the two sale columns are hidden,
 * both following the reference. The reference leaves the sale figures at zero;
 * ours carry the item's default selling price, which is real data (A-24).
 *
 * "Serials" is still absent — unlike the sale price there is no column behind
 * it anywhere in the model (A-20).
 */
const LINE_COLUMNS = [
  { col: 'stt', label: 'STT', type: ReportColumnDataType.NUMBER, align: 'center' as const },
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'name', label: 'Tên hàng hóa', type: ReportColumnDataType.STRING, span: 4 },
  { col: 'uom', label: 'ĐVT', type: ReportColumnDataType.STRING },
  { col: 'position', label: 'Vị trí', type: ReportColumnDataType.STRING },
  { col: 'quantity', label: 'SL', type: ReportColumnDataType.NUMBER },
  { col: 'unitPrice', label: 'Đơn giá', type: ReportColumnDataType.CURRENCY },
  { col: 'lineTotal', label: 'Thành tiền', type: ReportColumnDataType.CURRENCY },
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
 * Maps a `GoodsReceiptEntity` (as returned by `GoodsReceiptService.getById`, already
 * carrying resolved `counterparty` and eager `lines`/`item`/`location`) into a
 * `VoucherPrintPayload` (ADR-05, ADR-10). Pure — the caller resolves `branch`
 * (`loadVoucherBranch`) and, when the receipt is the inbound leg of a transfer, the
 * source store name, before calling this.
 */
export function mapGoodsReceiptToVoucherPayload(
  receipt: GoodsReceiptEntity,
  branch: DocumentBranchInfo | null,
  transferSourceStoreName?: string | null,
): VoucherPrintPayload {
  const lines: ReportRow[] = receipt.lines.map((line, index) => {
    const quantity = Number(line.quantity);
    const salePrice = Number(line.item?.sellingPrice ?? 0);
    return {
      stt: index + 1,
      sku: line.item?.code ?? null,
      name: line.item?.name ?? null,
      uom: line.uomCode ?? null,
      position: line.location?.name ?? null,
      quantity,
      unitPrice: Number(line.unitPrice),
      lineTotal: Number(line.lineTotal),
      salePrice,
      saleTotal: salePrice * quantity,
      note: line.note ?? null,
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
    // A unit price has no meaningful sum, same as elsewhere in the reports.
    unitPrice: null,
    lineTotal: totalAmount,
    salePrice: null,
    saleTotal: sum('saleTotal'),
    note: null,
  };

  const info = [
    { label: 'Đối tượng', value: receipt.counterparty?.name ?? '—' },
    { label: 'Người giao', value: receipt.deliveredBy ?? '—' },
    { label: 'Diễn giải', value: receipt.description ?? receipt.reason ?? '—' },
  ];
  if (transferSourceStoreName) {
    info.push({
      label: 'Cửa hàng xuất điều chuyển',
      value: transferSourceStoreName,
    });
  }

  return {
    kind: VoucherKind.GOODS_RECEIPT,
    paper: 'A4',
    title: 'PHIẾU NHẬP KHO',
    docNo: receipt.documentNumber ?? '',
    docDate: toLongVietnameseDate(receipt.receivedAt),
    branch,
    info,
    lineColumns: LINE_COLUMNS,
    lines,
    totals: lines.length ? totals : null,
    totalsLabel: 'Tổng',
    amountInWords: lines.length ? amountInWordsVi(totalAmount) : undefined,
    signatures: SIGNATURES,
  };
}
