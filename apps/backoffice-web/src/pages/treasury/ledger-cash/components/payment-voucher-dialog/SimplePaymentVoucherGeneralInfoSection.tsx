import { Button, FormField, Input, type FormFieldProps } from "@erp/ui";
import {
  FormShellDialog,
  FORM_SHELL_SECTION_LABELS,
} from "../../../../../components/form-shell-dialog";
import { READONLY_INPUT_CLASS } from "../../ledger-cash.constants";
import type { LedgerCashVoucherDetail } from "../../ledger-cash.types";

interface Props {
  detail: LedgerCashVoucherDetail;
  fieldProps: Partial<FormFieldProps>;
}

export function SimplePaymentVoucherGeneralInfoSection({
  detail,
  fieldProps,
}: Props) {
  return (
    <section className="space-y-2">
      <FormShellDialog.SectionHeading label={FORM_SHELL_SECTION_LABELS.GENERAL_INFO} />
      <div className="space-y-1 px-3">
        <FormField
          label="Nhà cung cấp"
          {...fieldProps}
        >
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
        <FormField
          label="Người nhận"
          {...fieldProps}
        >
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
        <FormField
          label="Lý do chi"
          {...fieldProps}
        >
          <Input
            readOnly
            value={detail.reason}
            className={READONLY_INPUT_CLASS}
          />
        </FormField>
        <FormField
          label="Nhân viên chi"
          {...fieldProps}
        >
          <div className="grid grid-cols-2 gap-2">
            <Input
              readOnly
              value={detail.employeeCode}
              className={READONLY_INPUT_CLASS}
            />
            <Input
              readOnly
              value={detail.employeeName}
              className={READONLY_INPUT_CLASS}
            />
          </div>
        </FormField>
        <FormField label="Tham chiếu" {...fieldProps}>
          <Input
            readOnly
            value={detail.reference ?? ""}
            className={READONLY_INPUT_CLASS}
          />
        </FormField>
        <FormField label="Tài liệu đính kèm" {...fieldProps}>
          <Button
            variant="outline"
            size="sm"
            disabled
            className="pointer-events-none"
          >
            Tải tệp…
          </Button>
        </FormField>
      </div>
    </section>
  );
}
