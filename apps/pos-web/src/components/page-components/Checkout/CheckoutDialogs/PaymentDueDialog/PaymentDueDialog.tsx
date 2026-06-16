import { useEffect, useId, useState, type FormEvent } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import { CalendarIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface PaymentDueDialogProps {
  open: boolean;
  onClose: () => void;
  /** Giá trị hiện tại (ISO `YYYY-MM-DD`) — `null` khi chưa đặt. */
  initialDate: string | null;
  /** Số ngày được nợ hiện tại — `null` khi chưa đặt. */
  initialDays: number | null;
  onConfirm: (date: string | null, days: number | null) => void;
}

/** Đầu ngày địa phương → ISO `YYYY-MM-DD` (tránh lệch timezone của `toISOString`). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDaysIso(days: number): string {
  const base = startOfToday();
  base.setDate(base.getDate() + days);
  return toIsoDate(base);
}

function daysFromToday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1);
  const diffMs = target.getTime() - startOfToday().getTime();
  return Math.round(diffMs / 86_400_000);
}

/**
 * Modal "Hạn thanh toán": chọn ngày hết hạn nợ + số ngày được nợ, đồng bộ 2
 * chiều quanh mốc hôm nay. Theo pattern `PosDialog` (overlay/focus/Esc tự lo);
 * footer dùng nút "Đồng ý"/"Đóng" mặc định.
 */
export function PaymentDueDialog({
  open,
  onClose,
  initialDate,
  initialDays,
  onConfirm,
}: PaymentDueDialogProps) {
  const formId = useId();
  const [date, setDate] = useState(initialDate ?? "");
  const [days, setDays] = useState(
    initialDays != null ? String(initialDays) : "",
  );

  // Sync internal state from props each time the dialog opens. The component
  // stays mounted, so without this the once-only useState initializer would
  // ignore a later-resolved prefill (e.g. org default fetched async) and keep
  // stale values across reopens. Prefer an explicit date; otherwise derive it
  // from the day count so date + days stay consistent.
  useEffect(() => {
    if (!open) return;
    if (initialDate) {
      setDate(initialDate);
      setDays(String(daysFromToday(initialDate)));
    } else if (initialDays != null) {
      setDays(String(initialDays));
      setDate(addDaysIso(initialDays));
    } else {
      setDate("");
      setDays("");
    }
  }, [open, initialDate, initialDays]);

  const handleDateChange = (next: string) => {
    setDate(next);
    setDays(next ? String(daysFromToday(next)) : "");
  };

  const handleDaysChange = (next: string) => {
    const digits = next.replace(/[^\d]/g, "");
    setDays(digits);
    setDate(digits ? addDaysIso(Number(digits)) : "");
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onConfirm(date || null, days ? Number(days) : null);
  };

  return (
    <PosDialog open={open} onClose={onClose} width={440}>
      <PosDialog.Header title="Hạn thanh toán" />
      <PosDialog.Body>
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 py-1"
        >
          <PosTextInput
            type="date"
            variant="underline"
            fieldLayout="horizontal"
            labelClassName="w-40 text-[#334155]"
            label="Hạn thanh toán"
            value={date}
            onChange={handleDateChange}
            trailing={
              <CalendarIcon
                size={18}
                aria-label="Chọn ngày"
                className="text-[#64748B]"
              />
            }
          />
          <PosTextInput
            inputMode="numeric"
            variant="underline"
            fieldLayout="horizontal"
            labelClassName="w-40 text-[#334155]"
            label="Số ngày được nợ"
            value={days}
            onChange={handleDaysChange}
          />
        </form>
      </PosDialog.Body>
      <PosDialog.Footer saveFormId={formId} onCancel={onClose} />
    </PosDialog>
  );
}
