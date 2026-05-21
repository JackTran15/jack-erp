import {
  BaseDataTable,
  type TableColumn,
} from "../../../../../components/table/BaseDataTable";
import type {
  LedgerCashVoucherDetail,
  LedgerCashVoucherDocumentLine,
  LedgerCashVoucherLine,
} from "../../ledger-cash.types";
import {
  FormShellDialog,
  FORM_SHELL_SECTION_LABELS,
} from "../../../../../components/form-shell-dialog";
import { Tabs } from "../../../../../components/tabs";
import {
  RECEIPT_VOUCHER_DETAIL_TABS,
  ReceiptVoucherDetailTabEnum,
} from "./receipt-voucher-dialog.constants";

interface Props {
  detail: LedgerCashVoucherDetail;
  activeTab: ReceiptVoucherDetailTabEnum;
  onTabChange: (tab: ReceiptVoucherDetailTabEnum) => void;
  lineColumns: TableColumn<LedgerCashVoucherLine>[];
  documentColumns: TableColumn<LedgerCashVoucherDocumentLine>[];
  documentLines: LedgerCashVoucherDocumentLine[];
}

export function ReceiptVoucherDetailSection({
  detail,
  activeTab,
  onTabChange,
  lineColumns,
  documentColumns,
  documentLines,
}: Props) {
  const tableProps = {
    loading: false as const,
    className: "min-h-0 flex-1",
    scrollContainerClassName: "min-h-0",
  };

  return (
    <FormShellDialog.DetailRegion>
      <FormShellDialog.SectionHeading
        label={FORM_SHELL_SECTION_LABELS.DETAIL}
      />
      <Tabs
        tabs={RECEIPT_VOUCHER_DETAIL_TABS}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
      <FormShellDialog.ScrollPane>
        {activeTab === ReceiptVoucherDetailTabEnum.LINES ? (
          <BaseDataTable
            {...tableProps}
            columns={lineColumns}
            rows={detail.lines}
            emptyLabel="Không có chi tiết."
            getRowKey={(r, i) => `${r.description}-${i}`}
          />
        ) : (
          <BaseDataTable
            {...tableProps}
            columns={documentColumns}
            rows={documentLines}
            emptyLabel="Không có chứng từ."
            getRowKey={(r) => r.documentNo}
          />
        )}
      </FormShellDialog.ScrollPane>
    </FormShellDialog.DetailRegion>
  );
}
