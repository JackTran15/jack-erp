import * as React from "react";
import { Filter } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export const PERIOD_PRESET_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "this_week", label: "Tuần này" },
  { value: "last_week", label: "Tuần trước" },
  { value: "this_month", label: "Tháng này" },
  { value: "last_month", label: "Tháng trước" },
  { value: "this_quarter", label: "Quý này" },
  { value: "this_year", label: "Năm nay" },
  { value: "custom", label: "Khác" },
];

export interface PeriodValue {
  preset: PeriodPreset;
  /** ISO date YYYY-MM-DD */
  from: string;
  /** ISO date YYYY-MM-DD */
  to: string;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay() || 7; // Mon=1..Sun=7
  const out = new Date(d);
  out.setDate(d.getDate() - (day - 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compute [from, to] ISO date range for a preset, anchored at `now`. */
export function resolvePeriodRange(preset: PeriodPreset, now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (preset === "today") {
    const iso = toIsoDate(today);
    return { from: iso, to: iso };
  }
  if (preset === "yesterday") {
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    const iso = toIsoDate(y);
    return { from: iso, to: iso };
  }
  if (preset === "this_week") {
    const from = startOfWeek(today);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }
  if (preset === "last_week") {
    const from = startOfWeek(today);
    from.setDate(from.getDate() - 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }
  if (preset === "this_month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }
  if (preset === "last_month") {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const to = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }
  if (preset === "this_quarter") {
    const q = Math.floor(today.getMonth() / 3);
    const from = new Date(today.getFullYear(), q * 3, 1);
    const to = new Date(today.getFullYear(), q * 3 + 3, 0);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }
  if (preset === "this_year") {
    const from = new Date(today.getFullYear(), 0, 1);
    const to = new Date(today.getFullYear(), 11, 31);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }
  // custom: caller-controlled, return today as a sensible default
  const iso = toIsoDate(today);
  return { from: iso, to: iso };
}

export interface PeriodFilterProps {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
  onApply: () => void;
  className?: string;
  /** Hide the Lấy dữ liệu button (when caller wants to react to changes immediately). */
  hideApply?: boolean;
}

/**
 * Header period filter: preset dropdown + Từ ngày / Đến ngày + "Lấy dữ liệu".
 * Selecting a preset auto-fills the date range; switching to "Khác" lets the
 * user pick freely.
 */
export function PeriodFilter({ value, onChange, onApply, className, hideApply }: PeriodFilterProps) {
  const handlePreset = (preset: PeriodPreset) => {
    if (preset === "custom") {
      onChange({ ...value, preset });
      return;
    }
    const range = resolvePeriodRange(preset);
    onChange({ preset, ...range });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm", className)}>
      <select
        className="h-8 rounded border border-input bg-background px-2 text-sm"
        value={value.preset}
        onChange={(e) => handlePreset(e.target.value as PeriodPreset)}
        aria-label="Khoảng thời gian"
      >
        {PERIOD_PRESET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Từ ngày</span>
        <input
          type="date"
          className="h-8 rounded border border-input bg-background px-2 text-sm"
          value={value.from}
          onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Đến ngày</span>
        <input
          type="date"
          className="h-8 rounded border border-input bg-background px-2 text-sm"
          value={value.to}
          onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })}
        />
      </label>
      {!hideApply ? (
        <Button size="sm" variant="outline" onClick={onApply}>
          <Filter className="mr-1.5 h-3.5 w-3.5" />
          Lấy dữ liệu
        </Button>
      ) : null}
    </div>
  );
}
