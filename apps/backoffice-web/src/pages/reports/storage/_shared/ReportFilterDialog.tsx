import { useEffect, useState } from "react";
import {
  Button,
  MultiSelect,
  PERIOD_PRESET_OPTIONS,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  resolvePeriodRange,
  SingleSelect,
  type PeriodPreset,
  type PeriodValue,
} from "@erp/ui";
import { Check, Filter, X } from "lucide-react";
import {
  ALL_VALUE,
  type FilterField,
  type FilterValues,
} from "./types";

export interface ReportFilterPopoverProps {
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
 * Self-contained filter popover. Renders its own "Chọn bộ lọc" trigger button;
 * open/close is managed by Radix Popover (click-outside, Escape handled natively).
 */
export function ReportFilterPopover({
  fields,
  value,
  onSubmit,
  width = 560,
}: ReportFilterPopoverProps) {
  const [draft, setDraft] = useState<FilterValues>(() => withDefaults(fields, value));

  const setField = (key: string, v: FilterValues[string]) =>
    setDraft((prev) => ({ ...prev, [key]: v }));

  return (
    <Popover onOpenChange={(isOpen) => { if (isOpen) setDraft(withDefaults(fields, value)); }}>
      <PopoverTrigger asChild>
        <Button variant="default" size="sm" className="h-9">
          <Filter className="mr-1.5 h-4 w-4" />
          Chọn bộ lọc
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="z-40 rounded-md border border-border bg-background p-4 shadow-lg"
        style={{ width }}
      >
        <div className="flex flex-col gap-3 text-sm">
          {fields.map((field) => {
            if (field.visibleWhen && !field.visibleWhen(draft)) return null;
            return (
              <div
                key={field.key}
                className="grid grid-cols-[120px_1fr] items-start gap-3"
              >
                <label className="pt-1.5 text-muted-foreground">
                  {field.label}
                  {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
                </label>
                <div className="min-w-0">
                  <FieldEditor field={field} draft={draft} setField={setField} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t pt-3">
          <PopoverClose asChild>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                // Reset hidden fields to their defaults before submitting.
                const cleaned = { ...draft };
                for (const f of fields) {
                  if (f.visibleWhen && !f.visibleWhen(draft)) {
                    cleaned[f.key] = defaultFor(f);
                  }
                }
                onSubmit(cleaned);
              }}
            >
              <Check className="mr-1 h-4 w-4" /> Đồng ý
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button variant="outline" size="sm">
              <X className="mr-1 h-4 w-4" /> Huỷ bỏ
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FieldEditorProps {
  field: FilterField;
  draft: FilterValues;
  setField: (key: string, v: FilterValues[string]) => void;
}

function FieldEditor({ field, draft, setField }: FieldEditorProps) {
  if (field.type === "select") {
    return <SelectFieldEditor field={field} draft={draft} setField={setField} />;
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

  return <PeriodFieldEditor field={field} draft={draft} setField={setField} />;
}

type SelectField = Extract<FilterField, { type: "select" }>;

function SelectFieldEditor({
  field,
  draft,
  setField,
}: {
  field: SelectField;
  draft: FilterValues;
  setField: (key: string, v: FilterValues[string]) => void;
}) {
  const v = (draft[field.key] as string | undefined) ?? ALL_VALUE;

  // Compute branch-filtered options when this field depends on a radio-scope field.
  let options = field.options;
  if (field.dependsOn) {
    const depMode = (draft[field.dependsOn] as string | undefined) ?? ALL_VALUE;
    const depValues = (draft[`${field.dependsOn}__values`] as string[] | undefined) ?? [];
    if (depMode !== ALL_VALUE && depValues.length > 0) {
      const depSet = new Set(depValues);
      options = field.options.filter(
        (o) => o.value === ALL_VALUE || (o.branchId != null && depSet.has(o.branchId)),
      );
    }
  }

  // Auto-reset to __all__ when the current value is no longer in the filtered options.
  useEffect(() => {
    if (v !== ALL_VALUE && !options.some((o) => o.value === v)) {
      setField(field.key, ALL_VALUE);
    }
    // options reference changes exactly when the branch selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  return (
    <SingleSelect
      options={options}
      value={v}
      onValueChange={(val) => setField(field.key, val)}
    />
  );
}

type PeriodField = Extract<FilterField, { type: "period" }>;

function PeriodFieldEditor({
  field,
  draft,
  setField,
}: {
  field: PeriodField;
  draft: FilterValues;
  setField: (key: string, v: FilterValues[string]) => void;
}) {
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
      <SingleSelect
        options={PERIOD_PRESET_OPTIONS}
        value={period.preset}
        onValueChange={(v) => handlePreset(v as PeriodPreset)}
      />
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
