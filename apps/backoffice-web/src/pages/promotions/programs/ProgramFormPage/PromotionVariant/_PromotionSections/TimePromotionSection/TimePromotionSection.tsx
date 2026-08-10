import { DateTimeField, FormField, Input } from "@erp/ui";
import { X } from "lucide-react";
import {
  DAY_OF_WEEK_OPTIONS,
  FORM_LABEL_WIDTH,
} from "../../../../program-form.constants";
import type { DayOfWeek, ProgramFormState } from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

const LABEL_WIDTH = FORM_LABEL_WIDTH;

export function TimePromotionSection({ form, onChange }: Props) {
  const toggleDay = (day: DayOfWeek) => {
    const next = form.daysOfWeek.includes(day)
      ? form.daysOfWeek.filter((d) => d !== day)
      : [...form.daysOfWeek, day];
    onChange({ daysOfWeek: next });
  };

  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Thời gian áp dụng
      </h2>
      <div className="flex flex-col gap-2">
        <FormField
          label="Thời gian"
          layout="horizontal"
          labelWidth={LABEL_WIDTH}
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <DateTimeField
                aria-label="Ngày bắt đầu"
                className="w-40"
                value={form.startDate}
                onChange={(e) => onChange({ startDate: e.target.value })}
              />
              <span className="text-muted-foreground">đến</span>
              <DateTimeField
                aria-label="Ngày kết thúc"
                className="w-40"
                value={form.endDate}
                onChange={(e) => onChange({ endDate: e.target.value })}
              />
            </div>
            <span className="text-xs italic text-muted-foreground">
              (Bỏ trống từ ngày, đến ngày nếu không giới hạn thời gian)
            </span>
          </div>
        </FormField>

        <FormField
          label="Theo ngày trong tuần"
          layout="horizontal"
          labelWidth={LABEL_WIDTH}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
            {DAY_OF_WEEK_OPTIONS.map((day) => (
              <label
                key={day.value}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border border-input accent-primary"
                  checked={form.daysOfWeek.includes(day.value)}
                  onChange={() => toggleDay(day.value)}
                />
                {day.label}
              </label>
            ))}
          </div>
        </FormField>

        <FormField label="Giờ áp dụng" layout="horizontal" labelWidth={LABEL_WIDTH}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Input
                type="time"
                aria-label="Giờ bắt đầu"
                className="w-32"
                value={form.startTime}
                onChange={(e) => onChange({ startTime: e.target.value })}
              />
              {form.startTime ? (
                <button
                  type="button"
                  aria-label="Xoá giờ bắt đầu"
                  onClick={() => onChange({ startTime: "" })}
                  className="text-muted-foreground hover:text-destructive hover:opacity-70"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <span className="text-muted-foreground">đến</span>
            <div className="flex items-center gap-1">
              <Input
                type="time"
                aria-label="Giờ kết thúc"
                className="w-32"
                value={form.endTime}
                onChange={(e) => onChange({ endTime: e.target.value })}
              />
              {form.endTime ? (
                <button
                  type="button"
                  aria-label="Xoá giờ kết thúc"
                  onClick={() => onChange({ endTime: "" })}
                  className="text-muted-foreground hover:text-destructive hover:opacity-70"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </FormField>
      </div>
    </section>
  );
}
