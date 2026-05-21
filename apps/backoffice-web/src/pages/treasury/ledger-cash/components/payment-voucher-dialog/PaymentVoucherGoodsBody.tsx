import type { FormFieldProps } from "@erp/ui";
import { useMemo } from "react";
import { FormShellDialog } from "../../../../../components/form-shell-dialog";
import { Tabs } from "../../../../../components/tabs";
import { VOUCHER_FORM_LABEL_WIDTH } from "../../ledger-cash.constants";
import {
  LedgerCashVoucherSheetTabEnum,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash.types";
import { PaymentVoucherGoodsReceiptFormSection } from "./PaymentVoucherGoodsReceiptFormSection";
import { PaymentVoucherPaymentFormSection } from "./PaymentVoucherPaymentFormSection";
import { PaymentVoucherOptionsBar } from "./PaymentVoucherOptionsBar";
import { PAYMENT_VOUCHER_SHEET_TABS } from "./payment-voucher-dialog.constants";
import { PaymentVoucherSkuDetailSection } from "./PaymentVoucherSkuDetailSection";
import { usePaymentVoucherSkuColumns } from "./usePaymentVoucherSkuColumns";

interface Props {
  detail: LedgerCashVoucherDetail;
  sheetTab: LedgerCashVoucherSheetTabEnum;
  onSheetTabChange: (tab: LedgerCashVoucherSheetTabEnum) => void;
}

export function PaymentVoucherGoodsBody({
  detail,
  sheetTab,
  onSheetTabChange,
}: Props) {
  const fieldProps: Partial<FormFieldProps> = {
    layout: "horizontal",
    labelWidth: VOUCHER_FORM_LABEL_WIDTH,
  };

  const skuColumns = usePaymentVoucherSkuColumns(true);

  const lineTotal = useMemo(
    () => (detail.lines ?? []).reduce((s, l) => s + l.amount, 0),
    [detail.lines],
  );

  const skuTotals = useMemo(() => {
    const lines = detail.skuLines ?? [];
    return {
      qty: lines.reduce((s, l) => s + l.quantity, 0),
      amount: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    };
  }, [detail.skuLines]);

  return (
    <FormShellDialog.Body>
      <PaymentVoucherOptionsBar detail={detail} />
      <Tabs
        tabs={PAYMENT_VOUCHER_SHEET_TABS}
        activeTab={sheetTab}
        onTabChange={onSheetTabChange}
      />

      <FormShellDialog.FormBlock key={detail.voucherNo}>
        {sheetTab === LedgerCashVoucherSheetTabEnum.GOODS_RECEIPT ? (
          <PaymentVoucherGoodsReceiptFormSection
            detail={detail}
            fieldProps={fieldProps}
          />
        ) : (
          <PaymentVoucherPaymentFormSection
            detail={detail}
            fieldProps={fieldProps}
          />
        )}
      </FormShellDialog.FormBlock>

      <PaymentVoucherSkuDetailSection
        detail={detail}
        skuColumns={skuColumns}
        skuTotals={skuTotals}
        lineTotal={lineTotal}
        showToolbar
      />
    </FormShellDialog.Body>
  );
}
