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
  LedgerCashVoucherLine,
} from "../../ledger-cash.types";

interface Props {
  detail: LedgerCashVoucherDetail;
  lineColumns: TableColumn<LedgerCashVoucherLine>[];
}

export function SimplePaymentVoucherDetailSection({
  detail,
  lineColumns,
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
      <FormShellDialog.ScrollPane>
        <BaseDataTable
          {...tableProps}
          columns={lineColumns}
          rows={detail.lines}
          emptyLabel="Không có chi tiết."
          getRowKey={(r, i) => `${r.description}-${i}`}
        />
      </FormShellDialog.ScrollPane>
    </FormShellDialog.DetailRegion>
  );
}
