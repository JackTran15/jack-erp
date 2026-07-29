import { useEffect, useState } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import type { ReportDateRangeFilter } from "@erp/shared-interfaces";

export interface PosDateRangeCustomDialogProps {
  open: boolean;
  value: ReportDateRangeFilter;
  onClose: () => void;
  onApply: (range: ReportDateRangeFilter) => void;
}

/** Trim an ISO string to the `datetime-local` input shape (YYYY-MM-DDTHH:mm). */
const toLocalInput = (iso?: string): string => (iso ? iso.slice(0, 16) : "");

/** Today's local date as "YYYY-MM-DD" (no UTC shift). */
const todayDateInput = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * "Chọn thời gian" — custom from–to range for the "Khác" preset. Both date
 * AND time are editable (datetime-local); defaults to today 00:00 (Từ) /
 * 23:59 (Đến) when no range has been set yet — a default, not a lock.
 */
export function PosDateRangeCustomDialog({
  open,
  value,
  onClose,
  onApply,
}: PosDateRangeCustomDialogProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (open) {
      const today = todayDateInput();
      setFrom(toLocalInput(value.from) || `${today}T00:00`);
      setTo(toLocalInput(value.to) || `${today}T23:59`);
    }
  }, [open, value.from, value.to]);

  return (
    <PosDialog open={open} onClose={onClose} width={420}>
      <PosDialog.Header title="Chọn thời gian" />
      <PosDialog.Body>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-[#4B5163]">Từ</span>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 w-[220px] rounded-lg border border-[#E1E3EA] px-3 text-[14px] focus:border-[#6366F1] focus:outline-none"
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-[14px] font-medium text-[#4B5163]">Đến</span>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 w-[220px] rounded-lg border border-[#E1E3EA] px-3 text-[14px] focus:border-[#6366F1] focus:outline-none"
            />
          </label>
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        saveLabel="Đồng ý"
        cancelLabel="Đóng"
        onCancel={onClose}
        onSave={() =>
          onApply({
            from: from ? `${from}:00` : undefined,
            to: to ? `${to}:00` : undefined,
          })
        }
      />
    </PosDialog>
  );
}
