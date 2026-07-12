import type React from "react";
import type { CrudEntityConfig, FieldDefinition } from "@erp/shared-interfaces";
import { Button, formatMoneyInteger } from "@erp/ui";
import { formatCrudFieldValue } from "../../lib/crud-display";

interface CrudDetailViewProps {
  config: CrudEntityConfig;
  record: Record<string, unknown>;
  onClose: () => void;
}

export function CrudDetailBody({
  config,
  record,
}: {
  config: CrudEntityConfig;
  record: Record<string, unknown>;
}) {
  return (
    <dl className="m-0">
      {config.fields.map((f) => {
        // Đơn vị tính: "Trạng thái" hiển thị là "Ngừng theo dõi" (đảo isActive),
        // nhất quán với modal/trang sửa đơn vị tính.
        const isUnitStatus =
          config.entityKey === "inventory-item-units" && f.key === "isActive";
        const label = isUnitStatus ? "Ngừng theo dõi" : f.label;
        const value = isUnitStatus ? record[f.key] === false : record[f.key];
        return (
          <div key={f.key} className="flex border-b border-border/50 py-2.5">
            <dt className="w-[180px] shrink-0 text-xs font-medium text-muted-foreground">
              {label}
            </dt>
            <dd className="m-0 text-sm text-foreground">{formatValue(value, f)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function CrudDetailView({
  config,
  record,
  onClose,
}: CrudDetailViewProps) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/40 pt-20"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-[600px] overflow-y-auto rounded-xl bg-background px-7 py-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Chi tiết {config.displayName}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={onClose}
          >
            ×
          </Button>
        </div>

        <CrudDetailBody config={config} record={record} />
      </div>
    </div>
  );
}

function formatValue(value: unknown, field: FieldDefinition): React.ReactNode {
  if (value === null || value === undefined) return "—";
  if (field.type === "enum") return formatCrudFieldValue(value, field);
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        disabled
        readOnly
        className="h-5 w-5 rounded border-2 border-input accent-primary cursor-default disabled:opacity-70"
      />
    );
  }
  if (field.type === "date") {
    try {
      return new Date(String(value)).toLocaleString("vi-VN");
    } catch {
      return String(value);
    }
  }
  if (field.type === "number" && field.numberFormat === "money") {
    const n = Number(value);
    return Number.isFinite(n) ? formatMoneyInteger(n) : String(value);
  }
  return String(value);
}
