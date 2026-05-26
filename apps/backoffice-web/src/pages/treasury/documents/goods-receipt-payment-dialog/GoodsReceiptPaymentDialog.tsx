import { useMemo } from "react";
import {
  DocumentFormDialog,
  formatMoneyInteger,
  type ToolbarItem,
} from "@erp/ui";
import { Barcode, MapPin, Percent, Upload, X } from "lucide-react";
import { Tabs } from "../../../../components/tabs";
import { PaymentVoucherGoodsReceiptFormSection } from "./PaymentVoucherGoodsReceiptFormSection";
import { PaymentVoucherOptionsBar } from "./PaymentVoucherOptionsBar";
import { PaymentVoucherPaymentFormSection } from "./PaymentVoucherPaymentFormSection";
import { PaymentVoucherSkuDetailSection } from "./PaymentVoucherSkuDetailSection";
import { PAYMENT_VOUCHER_SHEET_TABS } from "./goods-receipt-payment.constants";
import { usePaymentVoucherSheetTab } from "./usePaymentVoucherSheetTab";
import { usePaymentVoucherSkuColumns } from "./usePaymentVoucherSkuColumns";
import { VOUCHER_FORM_LABEL_WIDTH } from "../../ledger-cash/ledger-cash.constants";
import {
  LedgerCashVoucherSheetTabEnum,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash/ledger-cash.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: LedgerCashVoucherDetail;
}

export function GoodsReceiptPaymentDialog({
  open,
  onOpenChange,
  detail,
}: Props) {
  const { sheetTab, setSheetTab } = usePaymentVoucherSheetTab(
    open,
    detail.voucherNo,
  );
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

  const toolbarItems: ToolbarItem[] = [
    {
      id: "close",
      label: "Đóng",
      icon: X,
      onClick: () => onOpenChange(false),
    },
  ];

  const fieldProps = {
    layout: "horizontal" as const,
    labelWidth: VOUCHER_FORM_LABEL_WIDTH,
  };

  return (
    <DocumentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Phiếu nhập hàng"
      defaultWidth={1040}
      toolbarItems={toolbarItems}
      headerContent={
        <div className="space-y-3">
          <PaymentVoucherOptionsBar detail={detail} />
          <Tabs
            tabs={PAYMENT_VOUCHER_SHEET_TABS}
            activeTab={sheetTab}
            onTabChange={setSheetTab}
          />
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
        </div>
      }
      detailActions={
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" disabled className="accent-primary" />
            <Barcode className="h-3.5 w-3.5" />
            Quét mã vạch
          </label>
          <span className="flex items-center gap-1 text-primary">
            <MapPin className="h-3.5 w-3.5" />
            Chọn kho
          </span>
          <span className="flex items-center gap-1 text-primary">
            <Upload className="h-3.5 w-3.5" />
            Nhập khẩu
          </span>
          <span className="flex items-center gap-1 text-primary">
            <Percent className="h-3.5 w-3.5" />
            Phân bổ chiết khấu
          </span>
        </div>
      }
      detail={
        <PaymentVoucherSkuDetailSection detail={detail} skuColumns={skuColumns} />
      }
      footerSummary={
        <div className="flex flex-wrap justify-end gap-6">
          <span>
            Tổng số lượng:{" "}
            <strong>{skuTotals.qty.toLocaleString("vi-VN")}</strong>
          </span>
          <span>
            Tổng thành tiền:{" "}
            <strong>{formatMoneyInteger(skuTotals.amount)}</strong>
          </span>
          <span>
            Tiền CK:{" "}
            <strong>{formatMoneyInteger(detail.discountAmount ?? 0)}</strong>
          </span>
          <span>
            Tiền thuế:{" "}
            <strong>{formatMoneyInteger(detail.taxAmount ?? 0)}</strong>
          </span>
          <span>
            Tổng tiền thanh toán: <strong>{formatMoneyInteger(lineTotal)}</strong>
          </span>
        </div>
      }
    />
  );
}
