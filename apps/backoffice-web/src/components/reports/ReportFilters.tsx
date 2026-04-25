import { useState } from "react";
import { Input, Label, DateTimeField } from "@erp/ui";

interface DateRange {
  startDate: string;
  endDate: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

interface ReportFiltersProps {
  showDateRange?: boolean;
  branchId: string;
  onBranchChange: (branchId: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

export function ReportFilters({
  showDateRange = true,
  branchId,
  onBranchChange,
  dateRange,
  onDateRangeChange,
}: ReportFiltersProps) {
  return (
    <div className="flex gap-3 items-center mb-4 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Label>Chi nhánh:</Label>
        <Input
          type="text"
          placeholder="Tất cả (gộp)"
          value={branchId}
          onChange={(e) => onBranchChange(e.target.value)}
          className="w-44"
        />
      </div>
      {showDateRange && (
        <>
          <div className="flex items-center gap-1.5">
            <Label>Từ:</Label>
            <DateTimeField
              value={dateRange.startDate}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, startDate: e.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label>Đến:</Label>
            <DateTimeField
              value={dateRange.endDate}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, endDate: e.target.value })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

export function useReportFilters() {
  const [branchId, setBranchId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: monthStartISO(),
    endDate: todayISO(),
  });

  return {
    branchId,
    setBranchId,
    dateRange,
    setDateRange,
    params: {
      branchId: branchId || undefined,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
  };
}
