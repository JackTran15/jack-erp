import {
  DocumentBranchInfo,
  InfoRow,
  ReportColumnDataType,
  ReportRow,
  VoucherKind,
  VoucherPrintPayload,
} from '@erp/shared-interfaces';
import { amountInWordsVi } from '../../../../common/utils/amount-in-words.util';
import { toLongVietnameseDate } from '../../../../common/utils/document-date.util';
import { TREASURY_PRINT_LABELS } from '../shared/treasury-print-labels';
import { CashPaymentEntity } from './cash-payment.entity';

const LABELS = TREASURY_PRINT_LABELS[VoucherKind.CASH_PAYMENT];

const LINE_COLUMNS = [
  { col: 'description', label: 'Diễn giải', type: ReportColumnDataType.STRING },
  { col: 'categoryName', label: 'Mục chi', type: ReportColumnDataType.STRING },
  { col: 'amount', label: 'Số tiền', type: ReportColumnDataType.CURRENCY },
];

const SIGNATURES = ['Người lập phiếu', 'Kế toán trưởng', 'Thủ quỹ', LABELS.lastSignature];

/** One `info` row, or none when the value is blank — an empty label:value line looks like a bug on paper. */
function infoRow(label: string, value?: string | null): InfoRow[] {
  const trimmed = value?.trim();
  return trimmed ? [{ label, value: trimmed }] : [];
}

/**
 * Maps a `CashPaymentEntity` (as returned by `CashPaymentsService.getById`, already
 * carrying its `lines`) into a `VoucherPrintPayload` (ADR-05). Pure — the caller
 * resolves `branch`, the cash account's display name, and each line's category
 * name (`categoryId` is a plain FK column, not a loaded relation) before calling
 * this. Same contract as `mapCashReceiptToVoucherPayload`.
 */
export function mapCashPaymentToVoucherPayload(
  payment: CashPaymentEntity,
  branch: DocumentBranchInfo | null,
  cashAccountName: string,
  categoryNames: Map<string, string>,
): VoucherPrintPayload {
  const lines: ReportRow[] = payment.lines.map((line) => ({
    description: line.description,
    categoryName: line.categoryId ? (categoryNames.get(line.categoryId) ?? null) : null,
    amount: Number(line.amount),
  }));

  const totalAmount = Number(payment.totalAmount);
  const totals: ReportRow = {
    description: null,
    categoryName: null,
    amount: totalAmount,
  };

  const info: InfoRow[] = [
    ...infoRow(LABELS.partyLabel, payment.partnerNameSnapshot),
    ...infoRow('Địa chỉ', payment.partnerAddressSnapshot),
    ...infoRow(LABELS.personLabel, payment.payeeName),
    ...infoRow('Lý do', payment.reason),
    ...infoRow('Quỹ tiền mặt', cashAccountName),
  ];

  return {
    kind: VoucherKind.CASH_PAYMENT,
    paper: 'A5',
    title: LABELS.title,
    docNo: payment.documentNumber ?? '',
    docDate: toLongVietnameseDate(new Date(payment.voucherDate)),
    branch,
    info,
    lineColumns: LINE_COLUMNS,
    lines,
    totals: lines.length ? totals : null,
    totalsLabel: 'Cộng',
    amountInWords: amountInWordsVi(totalAmount),
    signatures: SIGNATURES,
  };
}
