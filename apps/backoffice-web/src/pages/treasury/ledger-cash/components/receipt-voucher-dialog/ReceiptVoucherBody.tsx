import type { FormFieldProps } from "@erp/ui";
import { FormShellDialog } from "../../../../../components/form-shell-dialog";
import { VOUCHER_FORM_LABEL_WIDTH } from "../../ledger-cash.constants";
import type { LedgerCashVoucherDetail } from "../../ledger-cash.types";
import { ReceiptVoucherDetailSection } from "./ReceiptVoucherDetailSection";
import { ReceiptVoucherGeneralInfoSection } from "./ReceiptVoucherGeneralInfoSection";
import { ReceiptVoucherMetaSection } from "./ReceiptVoucherMetaSection";
import { ReceiptVoucherPurposeField } from "./ReceiptVoucherPurposeField";
import type { ReceiptVoucherDetailTabEnum } from "./receipt-voucher-dialog.constants";
import { useReceiptVoucherDetailColumns } from "./useReceiptVoucherDetailColumns";

interface Props {
  detail: LedgerCashVoucherDetail;
  detailTab: ReceiptVoucherDetailTabEnum;
  onDetailTabChange: (tab: ReceiptVoucherDetailTabEnum) => void;
}

export function ReceiptVoucherBody({
  detail,
  detailTab,
  onDetailTabChange,
}: Props) {
  const fieldProps: Partial<FormFieldProps> = {
    layout: "horizontal",
    labelWidth: VOUCHER_FORM_LABEL_WIDTH,
  };

  const { lineColumnsWithFooter, documentColumnsWithFooter, documentLines } =
    useReceiptVoucherDetailColumns(detail);

  return (
    <FormShellDialog.Body>
      <FormShellDialog.FormBlock
        key={detail.voucherNo}
        contentClassName="space-y-2"
      >
        <ReceiptVoucherPurposeField detail={detail} fieldProps={fieldProps} />
        <FormShellDialog.TwoPane>
          <ReceiptVoucherGeneralInfoSection
            detail={detail}
            fieldProps={fieldProps}
          />
          <ReceiptVoucherMetaSection detail={detail} fieldProps={fieldProps} />
        </FormShellDialog.TwoPane>
      </FormShellDialog.FormBlock>

      <ReceiptVoucherDetailSection
        detail={detail}
        activeTab={detailTab}
        onTabChange={onDetailTabChange}
        lineColumns={lineColumnsWithFooter}
        documentColumns={documentColumnsWithFooter}
        documentLines={documentLines}
      />
    </FormShellDialog.Body>
  );
}
