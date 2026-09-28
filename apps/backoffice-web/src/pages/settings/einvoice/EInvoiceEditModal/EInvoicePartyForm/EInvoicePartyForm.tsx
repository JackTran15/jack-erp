import { Input } from "@erp/ui";
import { Info } from "lucide-react";

export interface PartyField {
  key: string;
  label: string;
  disabled?: boolean;
  placeholder?: string;
  /** Tooltip của icon (i) cạnh nhãn. */
  info?: string;
}

interface Props {
  left: readonly PartyField[];
  right: readonly PartyField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: PartyField;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label htmlFor={`einv-${field.key}`} className="flex items-center gap-2 text-[13px]">
        {field.label}
        {field.info ? (
          <span title={field.info} aria-label={field.info} className="inline-flex">
            <Info className="h-4 w-4 shrink-0 fill-primary-blue text-background" aria-hidden />
          </span>
        ) : null}
      </label>
      <Input
        id={`einv-${field.key}`}
        className="h-8 text-[13px]"
        value={value}
        disabled={field.disabled}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    </div>
  );
}

/** Form 2 cột "nhãn trái 120px — ô nhập phải" của modal Sửa (người mua / người bán). */
export function EInvoicePartyForm({ left, right, values, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-12">
      {[left, right].map((fields, column) => (
        <div key={column} className="flex flex-col gap-2">
          {fields.map((field) => (
            <FieldRow key={field.key} field={field} value={values[field.key] ?? ""} onChange={onChange} />
          ))}
        </div>
      ))}
    </div>
  );
}
