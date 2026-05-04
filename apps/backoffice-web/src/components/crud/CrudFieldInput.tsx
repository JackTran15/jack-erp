import type { ReactNode } from "react";
import type { FieldDefinition } from "@erp/shared-interfaces";
import { FormField, Input } from "@erp/ui";
import { formatCustomerStatus } from "../../lib/customer-display";

function ControlRow({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  if (!trailing) return <>{children}</>;
  return (
    <div className="flex w-full items-start gap-1.5">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5">{trailing}</div>
    </div>
  );
}

export function CrudFieldInput({
  field,
  value,
  error,
  onChange,
  inputIdPrefix,
  trailing,
}: {
  field: FieldDefinition;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  inputIdPrefix: string;
  trailing?: ReactNode;
}) {
  const inputId = `${inputIdPrefix}-${field.key}`;

  if (field.type === "boolean") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-start gap-3">
          <input
            id={inputId}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-input accent-primary"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <label
              htmlFor={inputId}
              className="cursor-pointer select-none text-sm font-medium leading-snug text-foreground"
            >
              {field.label}
              {field.required ? (
                <span className="ml-0.5 text-destructive" aria-hidden>
                  *
                </span>
              ) : null}
            </label>
            {trailing ? (
              <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>
            ) : null}
          </div>
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (field.type === "enum" && field.enumValues) {
    return (
      <FormField label={field.label} htmlFor={inputId} error={error} required={field.required}>
        <ControlRow trailing={trailing}>
          <select
            id={inputId}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">-- Chọn --</option>
            {field.enumValues.map((enumValue) => (
              <option key={enumValue} value={enumValue}>
                {field.key === "status" ? formatCustomerStatus(enumValue) : enumValue}
              </option>
            ))}
          </select>
        </ControlRow>
      </FormField>
    );
  }

  if (field.type === "number") {
    return (
      <FormField label={field.label} htmlFor={inputId} error={error} required={field.required}>
        <ControlRow trailing={trailing}>
          <Input
            id={inputId}
            type="number"
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(event) =>
              onChange(event.target.value === "" ? "" : Number(event.target.value))
            }
          />
        </ControlRow>
      </FormField>
    );
  }

  if (field.type === "date") {
    return (
      <FormField label={field.label} htmlFor={inputId} error={error} required={field.required}>
        <ControlRow trailing={trailing}>
          <Input
            id={inputId}
            type="date"
            value={value ? String(value).slice(0, 10) : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        </ControlRow>
      </FormField>
    );
  }

  return (
    <FormField label={field.label} htmlFor={inputId} error={error} required={field.required}>
      <ControlRow trailing={trailing}>
        <Input
          id={inputId}
          type="text"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      </ControlRow>
    </FormField>
  );
}
