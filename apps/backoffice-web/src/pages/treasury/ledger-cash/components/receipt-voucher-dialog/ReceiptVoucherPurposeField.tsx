import { FormField, type FormFieldProps } from "@erp/ui";
import { RadioGroup } from "../../../../../components/forms/RadioGroup";
import type { LedgerCashVoucherDetail } from "../../ledger-cash.types";
import { RECEIPT_VOUCHER_PURPOSE_OPTIONS } from "./receipt-voucher-dialog.constants";

interface Props {
  detail: LedgerCashVoucherDetail;
  fieldProps: Partial<FormFieldProps>;
}

export function ReceiptVoucherPurposeField({ detail, fieldProps }: Props) {
  return (
    <FormField label="Mục đích thu" {...fieldProps}>
      <RadioGroup
        name="voucher-purpose"
        value={detail.purpose}
        readOnly
        options={[...RECEIPT_VOUCHER_PURPOSE_OPTIONS]}
      />
    </FormField>
  );
}
