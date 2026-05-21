import { FormField, Input, type FormFieldProps } from "@erp/ui";
import {
  FormShellDialog,
  FORM_SHELL_SECTION_LABELS,
} from "../../../../../components/form-shell-dialog";
import {
  LEDGER_CASH_VI_DATE,
  READONLY_INPUT_CLASS,
} from "../../ledger-cash.constants";
import type { LedgerCashVoucherDetail } from "../../ledger-cash.types";

interface Props {
  detail: LedgerCashVoucherDetail;
  fieldProps: Partial<FormFieldProps>;
}

export function SimplePaymentVoucherMetaSection({ detail, fieldProps }: Props) {
  return (
    <section className="space-y-2">
      <FormShellDialog.SectionHeading label={FORM_SHELL_SECTION_LABELS.DOCUMENT} />
      <div className="space-y-1 px-3">
        <FormField
          label="Số phiếu chi"
          {...fieldProps}
          labelWidth="7.5rem"
        >
          <Input
            readOnly
            value={detail.voucherNo}
            className={READONLY_INPUT_CLASS}
          />
        </FormField>
        <FormField
          label="Ngày chi"
          {...fieldProps}
          labelWidth="7.5rem"
        >
          <Input
            readOnly
            value={detail.voucherDate.toLocaleDateString(
              "vi-VN",
              LEDGER_CASH_VI_DATE,
            )}
            className={READONLY_INPUT_CLASS}
          />
        </FormField>
      </div>
    </section>
  );
}
