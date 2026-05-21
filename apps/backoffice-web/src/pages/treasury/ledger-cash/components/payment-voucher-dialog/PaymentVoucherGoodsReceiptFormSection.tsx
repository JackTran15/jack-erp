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

export function PaymentVoucherGoodsReceiptFormSection({
  detail,
  fieldProps,
}: Props) {
  const gr = detail.goodsReceipt;
  if (!gr) return null;

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
          <FormField label="Người giao" {...fieldProps}>
            <Input
              readOnly
              value={gr.delivererName}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Diễn giải" {...fieldProps}>
            <Input
              readOnly
              value={gr.narrative}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
          <FormField label="NV mua hàng" {...fieldProps}>
            <div className="grid grid-cols-2 gap-2">
              <Input
                readOnly
                value={gr.purchaseEmployeeCode}
                className={READONLY_INPUT_CLASS}
              />
              <Input
                readOnly
                value={gr.purchaseEmployeeName}
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

      <section className="space-y-2">
        <FormShellDialog.SectionHeading
          label={FORM_SHELL_SECTION_LABELS.DOCUMENT}
        />
        <div className="space-y-1 px-3">
          <FormField label="Số phiếu nhập" {...fieldProps} labelWidth="7.5rem">
            <Input
              readOnly
              value={gr.receiptNo}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Ngày nhập" {...fieldProps} labelWidth="7.5rem">
            <Input
              readOnly
              value={gr.receiptDate.toLocaleDateString(
                "vi-VN",
                LEDGER_CASH_VI_DATE,
              )}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Giờ nhập" {...fieldProps} labelWidth="7.5rem">
            <Input
              readOnly
              value={gr.receiptTime}
              className={READONLY_INPUT_CLASS}
            />
          </FormField>
        </div>
      </section>
    </div>
  );
}
