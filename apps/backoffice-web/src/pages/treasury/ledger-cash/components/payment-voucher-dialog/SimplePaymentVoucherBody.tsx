import type { FormFieldProps } from "@erp/ui";
import { FormShellDialog } from "../../../../../components/form-shell-dialog";
import { VOUCHER_FORM_LABEL_WIDTH } from "../../ledger-cash.constants";
import type { LedgerCashVoucherDetail } from "../../ledger-cash.types";
import { SimplePaymentVoucherDetailSection } from "./SimplePaymentVoucherDetailSection";
import { SimplePaymentVoucherGeneralInfoSection } from "./SimplePaymentVoucherGeneralInfoSection";
import { SimplePaymentVoucherMetaSection } from "./SimplePaymentVoucherMetaSection";
import { useSimplePaymentVoucherLineColumns } from "./useSimplePaymentVoucherLineColumns";

interface Props {
  detail: LedgerCashVoucherDetail;
}

export function SimplePaymentVoucherBody({ detail }: Props) {
  const fieldProps: Partial<FormFieldProps> = {
    layout: "horizontal",
    labelWidth: VOUCHER_FORM_LABEL_WIDTH,
  };

  const { lineColumnsWithFooter } = useSimplePaymentVoucherLineColumns(detail);

  return (
    <FormShellDialog.Body>
      <FormShellDialog.Slot>
        <FormShellDialog.TwoPane>
          <SimplePaymentVoucherGeneralInfoSection
            detail={detail}
            fieldProps={fieldProps}
          />
          <SimplePaymentVoucherMetaSection
            detail={detail}
            fieldProps={fieldProps}
          />
        </FormShellDialog.TwoPane>
      </FormShellDialog.Slot>

      <SimplePaymentVoucherDetailSection
        detail={detail}
        lineColumns={lineColumnsWithFooter}
      />
    </FormShellDialog.Body>
  );
}
