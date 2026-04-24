import { useState } from "react";

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
    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
      <label>
        Branch:
        <input
          type="text"
          placeholder="All (consolidated)"
          value={branchId}
          onChange={(e) => onBranchChange(e.target.value)}
          style={{ marginLeft: 4, padding: "4px 8px" }}
        />
      </label>
      {showDateRange && (
        <>
          <label>
            From:
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, startDate: e.target.value })
              }
              style={{ marginLeft: 4, padding: "4px 8px" }}
            />
          </label>
          <label>
            To:
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) =>
                onDateRangeChange({ ...dateRange, endDate: e.target.value })
              }
              style={{ marginLeft: 4, padding: "4px 8px" }}
            />
          </label>
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
