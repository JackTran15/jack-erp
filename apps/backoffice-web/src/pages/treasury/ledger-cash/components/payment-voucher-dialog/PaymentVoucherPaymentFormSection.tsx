import { Button, FormField, Input, type FormFieldProps } from "@erp/ui";
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

export function PaymentVoucherPaymentFormSection({
  detail,
  fieldProps,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section className="space-y-2">
        <FormShellDialog.SectionHeading
          label={FORM_SHELL_SECTION_LABELS.GENERAL_INFO}
        />
        <div className="space-y-1 px-3">
          <FormField label="Nhà cung cấp" {...fieldProps}>
            <div className="grid grid-cols-2 gap-2">
              <Input
                readOnly
                value={detail.counterpartyCode}
                className={READONLY_INPUT_CLASS}
              />
              <Input
                readOnly
                value={detail.counterpartyName}
                className={READONLY_INPUT_CLASS}
              />
            </div>
          </FormField>
          <FormField label="Người nhận" {...fieldProps}>
            <Input
              readOnly
              value={detail.payerName ?? ""}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Địa chỉ" {...fieldProps}>
            <Input
              readOnly
              value={detail.address ?? ""}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Lý do chi" {...fieldProps}>
            <Input
              readOnly
              value={detail.reason}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
        </div>
      </section>

      <section className="space-y-2">
        <FormShellDialog.SectionHeading
          label={FORM_SHELL_SECTION_LABELS.DOCUMENT}
        />
        <div className="space-y-1 px-3">
          <FormField label="Số phiếu chi" {...fieldProps} labelWidth="7.5rem">
            <Input
              readOnly
              value={detail.voucherNo}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Ngày chi" {...fieldProps} labelWidth="7.5rem">
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
    </div>
  );
}
