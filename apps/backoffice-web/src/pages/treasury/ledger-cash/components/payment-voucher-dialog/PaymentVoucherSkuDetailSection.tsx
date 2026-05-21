import { formatMoneyInteger } from "@erp/ui";
import { Barcode, MapPin, Percent, Upload } from "lucide-react";
import {
  FormShellDialog,
  FORM_SHELL_SECTION_LABELS,
} from "../../../../../components/form-shell-dialog";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../../../components/table/BaseDataTable";
import type {
  LedgerCashVoucherDetail,
  LedgerCashVoucherSkuLine,
} from "../../ledger-cash.types";

interface Props {
  detail: LedgerCashVoucherDetail;
  skuColumns: TableColumn<LedgerCashVoucherSkuLine>[];
  skuTotals: { qty: number; amount: number };
  lineTotal: number;
  showToolbar?: boolean;
}

export function PaymentVoucherSkuDetailSection({
  detail,
  skuColumns,
  skuTotals,
  lineTotal,
  showToolbar = false,
}: Props) {
  const rows = detail.skuLines ?? [];

  return (
    <FormShellDialog.DetailRegion>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <FormShellDialog.SectionHeading
          label={FORM_SHELL_SECTION_LABELS.DETAIL}
        />
        {showToolbar ? (
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
        ) : null}
      </div>

      <FormShellDialog.ScrollPane>
        <BaseDataTable
          className="min-h-0 flex-1"
          scrollContainerClassName="min-h-0"
          columns={skuColumns}
          rows={rows}
          loading={false}
          emptyLabel="Không có hàng hóa."
          getRowKey={(r) => r.sku}
        />
      </FormShellDialog.ScrollPane>

      <div className="flex shrink-0 flex-wrap justify-end gap-6 border-t bg-muted/30 px-3 py-2 text-sm">
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
    </FormShellDialog.DetailRegion>
  );
}
