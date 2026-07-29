import { cn } from "@erp/ui";
import type { IDropdownOption, ReportDateRangeFilter } from "@erp/shared-interfaces";
import { PosDateRangeFilter } from "@erp/pos/components/common/PosDateRangeFilter/PosDateRangeFilter";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import {
  ColumnsIcon,
  DownloadIcon,
  PrinterIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { useReportFilterOptionsQuery } from "@erp/pos/hooks/react-query/use-query-daily-report";
import {
  splitDateTimeVi,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import { staffOptionName } from "@erp/pos/lib/page-libs/daily-report/formatDailyReport";

export interface DailyReportToolbarProps {
  dateRange: PosDateRangeFilterOption;
  onDateRangeChange: (next: PosDateRangeFilterOption) => void;
  /** Resolved request window — shown as "(dd/mm/yyyy HH:mm - dd/mm/yyyy HH:mm)". */
  issuedAt: ReportDateRangeFilter;
  /** Custom Từ–Đến (preset "Khác") — shown inline under the option, clickable to edit. */
  customRange: ReportDateRangeFilter;
  onOpenCustomRange: () => void;
  cashierId: string | null;
  onCashierChange: (id: string | null) => void;
  salespersonId: string | null;
  onSalespersonChange: (id: string | null) => void;
  showPrintExport: boolean;
  onPrint: () => void;
  onExport: () => void;
  /** "Thiết lập cột hiển thị" — only meaningful on tab Doanh thu theo mặt hàng. */
  showColumnSettings?: boolean;
  onOpenColumnSettings?: () => void;
}

const ALL_CASHIER: IDropdownOption = { value: "", label: "Tất cả thu ngân" };
const ALL_SALESPERSON: IDropdownOption = { value: "", label: "Tất cả NVBH" };

function RangeBoundaryRow({
  label,
  iso,
  boundary,
  onClick,
}: {
  label: string;
  iso?: string;
  boundary: "from" | "to";
  onClick: () => void;
}) {
  const parts = splitDateTimeVi(iso, boundary);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 py-1 text-left text-[13px] text-[#4B5163] hover:text-[#6366F1]"
    >
      <span className="w-8 shrink-0">{label}</span>
      <span className="font-medium">
        {parts ? `${parts.date} - ${parts.time}` : "Chọn ngày"}
      </span>
    </button>
  );
}

export function DailyReportToolbar({
  dateRange,
  onDateRangeChange,
  issuedAt,
  customRange,
  onOpenCustomRange,
  cashierId,
  onCashierChange,
  salespersonId,
  onSalespersonChange,
  showPrintExport,
  onPrint,
  onExport,
  showColumnSettings,
  onOpenColumnSettings,
}: DailyReportToolbarProps) {
  const cashiers = useReportFilterOptionsQuery("cashier");
  const salespeople = useReportFilterOptionsQuery("salesperson");

  const cashierItems = [ALL_CASHIER, ...(cashiers.data ?? [])];
  const salespersonItems = [ALL_SALESPERSON, ...(salespeople.data ?? [])];

  const selectedCashier =
    cashierItems.find((c) => String(c.value) === (cashierId ?? "")) ?? ALL_CASHIER;
  const selectedSalesperson =
    salespersonItems.find((s) => String(s.value) === (salespersonId ?? "")) ??
    ALL_SALESPERSON;

  const fromParts = splitDateTimeVi(issuedAt.from, "from");
  const toParts = splitDateTimeVi(issuedAt.to, "to");
  const rangeText =
    fromParts || toParts
      ? `(${fromParts ? `${fromParts.date} ${fromParts.time}` : "..."} - ${
          toParts ? `${toParts.date} ${toParts.time}` : "..."
        })`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#E5E7EB] bg-white px-4 py-3">
      <PosDateRangeFilter
        value={dateRange}
        onChange={(next) =>
          next === "OTHER" ? onOpenCustomRange() : onDateRangeChange(next)
        }
        otherExtra={
          <div className="space-y-1">
            <RangeBoundaryRow
              label="Từ"
              iso={customRange.from}
              boundary="from"
              onClick={onOpenCustomRange}
            />
            <RangeBoundaryRow
              label="Đến"
              iso={customRange.to}
              boundary="to"
              onClick={onOpenCustomRange}
            />
          </div>
        }
      />

      <PosSelect<IDropdownOption>
        value={selectedCashier}
        onChange={(item) => onCashierChange(item.value ? String(item.value) : null)}
        items={cashierItems}
        itemKey={(item) => String(item.value)}
        renderItem={(item) => item.label}
        renderSelected={staffOptionName}
        className="w-[240px]"
      />

      <PosSelect<IDropdownOption>
        value={selectedSalesperson}
        onChange={(item) =>
          onSalespersonChange(item.value ? String(item.value) : null)
        }
        items={salespersonItems}
        itemKey={(item) => String(item.value)}
        renderItem={(item) => item.label}
        renderSelected={staffOptionName}
        className="w-[240px]"
      />

      {rangeText ? (
        <span className="text-[13px] text-[#6B7280]">{rangeText}</span>
      ) : null}

      {showPrintExport ? (
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onPrint}
            aria-label="In"
            title="In"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1E3EA] bg-white text-[#4B5163]",
              "hover:border-[#C7CAD3] hover:bg-[#FAFAFB] hover:text-[#1F2233]",
            )}
          >
            <PrinterIcon size={18} />
          </button>
          <button
            type="button"
            onClick={onExport}
            aria-label="Xuất"
            title="Xuất"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1E3EA] bg-white text-[#4B5163]",
              "hover:border-[#C7CAD3] hover:bg-[#FAFAFB] hover:text-[#1F2233]",
            )}
          >
            <DownloadIcon size={18} />
          </button>
          {showColumnSettings ? (
            <button
              type="button"
              onClick={onOpenColumnSettings}
              aria-label="Thiết lập cột hiển thị"
              title="Thiết lập cột hiển thị"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1E3EA] bg-white text-[#4B5163]",
                "hover:border-[#C7CAD3] hover:bg-[#FAFAFB] hover:text-[#1F2233]",
              )}
            >
              <ColumnsIcon size={18} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
