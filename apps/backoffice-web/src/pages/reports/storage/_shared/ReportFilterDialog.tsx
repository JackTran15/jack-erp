import { useEffect, useRef, useState } from "react";
import {
  Button,
  MultiSelect,
  PERIOD_PRESET_OPTIONS,
  resolvePeriodRange,
  type PeriodPreset,
  type PeriodValue,
} from "@erp/ui";
import { Check, X } from "lucide-react";
import {
  ALL_VALUE,
  type FilterField,
  type FilterValues,
} from "./types";

export interface ReportFilterPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FilterField[];
  value: FilterValues;
  onSubmit: (next: FilterValues) => void;
  /** Optional CSS width for the popover panel. */
  width?: number;
}

function defaultFor(field: FilterField): FilterValues[string] {
  switch (field.type) {
    case "select":
      return field.options[0]?.value ?? ALL_VALUE;
    case "multi-select":
      return [];
    case "radio-scope":
      return ALL_VALUE;
    case "period": {
      const range = resolvePeriodRange("this_month");
      return { preset: "this_month", ...range } satisfies PeriodValue;
    }
  }
}

export function withDefaults(
  fields: FilterField[],
  current: FilterValues,
): FilterValues {
  const next: FilterValues = { ...current };
  for (const f of fields) {
    if (next[f.key] === undefined) next[f.key] = defaultFor(f);
    if (f.type === "radio-scope" && next[`${f.key}__values`] === undefined) {
      next[`${f.key}__values`] = [];
    }
  }
  return next;
}

/**
 * Filter panel rendered as a popover under the "Chọn bộ lọc" button.
 * The caller is responsible for placing this inside a `relative` parent
 * and showing/hiding via the `open` prop.
 */
export function ReportFilterPopover({
  open,
  onOpenChange,
  fields,
  value,
  onSubmit,
  width = 560,
}: ReportFilterPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<FilterValues>(() => withDefaults(fields, value));

  useEffect(() => {
    if (open) setDraft(withDefaults(fields, value));
  }, [open, fields, value]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) {
        // Ignore clicks on the trigger itself — caller toggles open separately.
        const trigger = (target as HTMLElement)?.closest?.("[data-report-filter-trigger]");
        if (trigger) return;
        onOpenChange(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const setField = (key: string, v: FilterValues[string]) =>
    setDraft((prev) => ({ ...prev, [key]: v }));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Chọn bộ lọc"
      className="absolute left-0 top-full z-40 mt-1 rounded-md border border-border bg-background p-4 shadow-lg"
      style={{ width }}
    >
      <div className="flex flex-col gap-3 text-sm">
        {fields.map((field) => (
          <div
            key={field.key}
            className="grid grid-cols-[120px_1fr] items-start gap-3"
          >
            <label className="pt-1.5 text-muted-foreground">
              {field.label}
              {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
            </label>
            <div className="min-w-0">{renderFieldEditor(field, draft, setField)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t pt-3">
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            onSubmit(draft);
            onOpenChange(false);
          }}
        >
          <Check className="mr-1 h-4 w-4" /> Đồng ý
        </Button>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          <X className="mr-1 h-4 w-4" /> Huỷ bỏ
        </Button>
      </div>
    </div>
  );
}

function renderFieldEditor(
  field: FilterField,
  draft: FilterValues,
  setField: (key: string, v: FilterValues[string]) => void,
) {
  if (field.type === "select") {
    const v = (draft[field.key] as string | undefined) ?? ALL_VALUE;
    return (
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={v}
        onChange={(e) => setField(field.key, e.target.value)}
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multi-select") {
    const v = (draft[field.key] as string[] | undefined) ?? [];
    return (
      <MultiSelect
        options={field.options}
        value={v}
        onValueChange={(next) => setField(field.key, next)}
        placeholder={field.placeholder ?? "Chọn…"}
      />
    );
  }

  if (field.type === "radio-scope") {
    const mode = (draft[field.key] as string | undefined) ?? ALL_VALUE;
    const values = (draft[`${field.key}__values`] as string[] | undefined) ?? [];
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={mode === ALL_VALUE}
              onChange={() => setField(field.key, ALL_VALUE)}
            />
            {field.allLabel}
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={mode !== ALL_VALUE}
              onChange={() => setField(field.key, "scope")}
            />
            {field.scopeLabel}
          </label>
        </div>
        {mode !== ALL_VALUE && (
          <MultiSelect
            options={field.options}
            value={values}
            onValueChange={(next) => setField(`${field.key}__values`, next)}
            placeholder={field.placeholder ?? "Chọn…"}
          />
        )}
      </div>
    );
  }

  // period
  const period =
    (draft[field.key] as PeriodValue | undefined) ?? {
      preset: "this_month" as PeriodPreset,
      ...resolvePeriodRange("this_month"),
    };
  const handlePreset = (preset: PeriodPreset) => {
    if (preset === "custom") {
      setField(field.key, { ...period, preset });
      return;
    }
    setField(field.key, { preset, ...resolvePeriodRange(preset) });
  };
  return (
    <div className="flex flex-col gap-2">
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={period.preset}
        onChange={(e) => handlePreset(e.target.value as PeriodPreset)}
      >
        {PERIOD_PRESET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Từ ngày
          <input
            type="date"
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            value={period.from}
            onChange={(e) =>
              setField(field.key, { ...period, preset: "custom", from: e.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Đến ngày
          <input
            type="date"
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            value={period.to}
            onChange={(e) =>
              setField(field.key, { ...period, preset: "custom", to: e.target.value })
            }
          />
        </label>
      </div>
    </div>
  );
}
