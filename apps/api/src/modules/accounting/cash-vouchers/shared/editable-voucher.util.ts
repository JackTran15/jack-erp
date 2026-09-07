import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Whether a treasury voucher may be edited or deleted in place, and why not when
 * it may not.
 *
 * The rule is keyed on `referenceType === 'MANUAL'`, NOT on `purpose` (ADR-05).
 * `purpose` cannot express "the user typed this": `CashPaymentPurpose` carries
 * `EXPENSE` and `SALARY`, which consumers also emit, and `CashReceiptPurpose`
 * carries both `OTHER` and `OTHER_INCOME`. `referenceType` can — the manual
 * `create()` path hard-codes `MANUAL`, no create DTO exposes the field, and every
 * saga/consumer route sets its own value (`INVOICE`, `INVOICE_DEBT`, `FUND_SWAP`,
 * `TRANSFER`, `REVERSAL`, …). It is therefore a server-controlled marker rather
 * than something a client can claim.
 *
 * Editing a saga-produced voucher would leave the flow that owns it inconsistent
 * — a collected debt still settled, a POS invoice still claiming a payment that
 * no longer matches. Those stay reversal-only, exactly as they are today.
 */
export const MANUAL_REFERENCE_TYPE = 'MANUAL';

/** The subset of a voucher this rule needs; both modules' entities satisfy it. */
export interface EditableVoucherFields {
  documentNumber?: string;
  status: string;
  referenceType?: string;
  reversedByVoucherId?: string;
  deletedAt?: Date;
  revision: number;
}

export function isManualVoucher(voucher: EditableVoucherFields): boolean {
  return voucher.referenceType === MANUAL_REFERENCE_TYPE;
}

/**
 * Throws unless the voucher may be edited or deleted.
 *
 * `postedStatus` is passed in because the two modules declare parallel status
 * enums (`CashVoucherStatus` / `BankVoucherStatus`) whose POSTED members are
 * distinct TypeScript values with the same string.
 */
export function assertEditable(
  voucher: EditableVoucherFields,
  postedStatus: string,
  label: string,
): void {
  if (!isManualVoucher(voucher)) {
    throw new BadRequestException(
      `${label} ${voucher.documentNumber ?? ''} được tạo tự động từ một chứng từ khác, chỉ có thể đảo bút, không sửa hoặc xoá được`.replace(
        '  ',
        ' ',
      ),
    );
  }
  if (voucher.deletedAt) {
    throw new ConflictException(`${label} đã bị xoá`);
  }
  if (voucher.reversedByVoucherId) {
    throw new ConflictException(`${label} đã được đảo bút, không sửa được nữa`);
  }
  if (voucher.status !== postedStatus) {
    throw new BadRequestException(
      `${label} ở trạng thái ${voucher.status}, chỉ sửa được phiếu đã ghi sổ`,
    );
  }
}

/**
 * Guards against two writers racing on the same voucher.
 *
 * The caller must have re-read the voucher inside its transaction with a row
 * lock before calling this; comparing against a value read outside the
 * transaction proves nothing.
 */
export function assertRevisionMatches(
  voucher: EditableVoucherFields,
  expected: number,
  label: string,
): void {
  if (voucher.revision !== expected) {
    throw new ConflictException(
      `${label} đã được người khác sửa (bản ${voucher.revision}, bạn đang giữ bản ${expected}). Tải lại phiếu rồi thử lại.`,
    );
  }
}
