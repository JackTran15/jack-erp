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
import { TREASURY_PRINT_LABELS } from '../../cash-vouchers/shared/treasury-print-labels';
import { BankPaymentEntity } from './bank-payment.entity';

const LABELS = TREASURY_PRINT_LABELS[VoucherKind.BANK_PAYMENT];

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
 * Maps a `BankPaymentEntity` (as returned by `BankPaymentsService.getById`, already
 * carrying its `lines`) into a `VoucherPrintPayload` (ADR-05). Pure — the caller
 * resolves `branch`, the bank account's display name, and each line's category
 * name (`categoryId` is a plain FK column, not a loaded relation) before calling
 * this. Same contract as `mapCashPaymentToVoucherPayload`, aside from the date
 * column (`docDate`, not `voucherDate`) and the extra `reference` row.
 */
export function mapBankPaymentToVoucherPayload(
  payment: BankPaymentEntity,
  branch: DocumentBranchInfo | null,
  bankAccountName: string,
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
    ...infoRow('Tài khoản ngân hàng', bankAccountName),
    ...infoRow('Tham chiếu', payment.reference),
  ];

  return {
    kind: VoucherKind.BANK_PAYMENT,
    paper: 'A5',
    title: LABELS.title,
    docNo: payment.documentNumber ?? '',
    docDate: toLongVietnameseDate(new Date(payment.docDate)),
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
