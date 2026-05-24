import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import type {
  CashCountDenominationLine,
  CashCountLinePatch,
} from "./cash-count.types";
import { useCashCountDenominationColumns } from "./useCashCountDenominationColumns";

interface Props {
  lines: CashCountDenominationLine[];
  readOnly?: boolean;
  onChangeLine?: (index: number, patch: CashCountLinePatch) => void;
}

export function CashCountDenominationTable({
  lines,
  readOnly = false,
  onChangeLine,
}: Props) {
  const columns = useCashCountDenominationColumns({
    lines,
    readOnly,
    onChangeLine,
  });

  return (
    <BaseDataTable
      className="min-h-0 flex-1 rounded-none border-0"
      scrollContainerClassName="min-h-0"
      columns={columns}
      rows={lines}
      loading={false}
      emptyLabel="Không có dòng mệnh giá."
      getRowKey={(line) => String(line.denomination)}
    />
  );
}
