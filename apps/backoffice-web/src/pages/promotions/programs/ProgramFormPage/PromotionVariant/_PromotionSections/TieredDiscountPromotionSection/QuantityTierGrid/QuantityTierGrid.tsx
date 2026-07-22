import { Button, Input, MoneyInput } from "@erp/ui";
import { Copy, Plus, Trash2 } from "lucide-react";
import { blankTierRow } from "../../../../../program-form.constants";
import type { TierRow } from "../../../../../program-form.types";

interface Props {
  value: TierRow[];
  onChange: (rows: TierRow[]) => void;
  /** Nhãn cột giá trị: "% giảm giá" hoặc "Số tiền giảm". */
  valueLabel: string;
  /** true khi đơn vị là số tiền (dùng MoneyInput cho cột giá trị). */
  isAmount: boolean;
}

const CELL_INPUT_CLASS =
  "h-9 rounded-none border-0 shadow-none text-right tabular-nums focus-visible:ring-1 focus-visible:ring-inset";

const toNumberOrEmpty = (raw: string): number | "" =>
  raw === "" ? "" : Number(raw);

/** Grid bậc thang số lượng (spec 4.18): mỗi dòng là khoảng [Từ, Đến] ứng với một mức giảm. */
export function QuantityTierGrid({
  value,
  onChange,
  valueLabel,
  isAmount,
}: Props) {
  const updateRow = (id: string, patch: Partial<TierRow>) => {
    onChange(value.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    onChange(value.filter((row) => row.id !== id));
  };

  const duplicateRow = (id: string) => {
    const index = value.findIndex((row) => row.id === id);
    if (index < 0) return;
    const copy: TierRow = { ...value[index], id: crypto.randomUUID() };
    const next = [...value];
    next.splice(index + 1, 0, copy);
    onChange(next);
  };

  const addRow = () => {
    onChange([...value, blankTierRow()]);
  };

  return (
    <div className="rounded border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-center font-bold text-foreground">
              <th className="border-b border-r border-border px-3 py-2">Từ</th>
              <th className="border-b border-r border-border px-3 py-2">Đến</th>
              <th className="border-b border-border px-3 py-2">{valueLabel}</th>
              <th className="w-16 border-b border-l border-border px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {value.map((row) => (
              <tr key={row.id}>
                <td className="border-b border-r border-border p-0">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className={CELL_INPUT_CLASS}
                    value={row.from}
                    onChange={(e) =>
                      updateRow(row.id, { from: toNumberOrEmpty(e.target.value) })
                    }
                  />
                </td>
                <td className="border-b border-r border-border p-0">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className={CELL_INPUT_CLASS}
                    value={row.to}
                    onChange={(e) =>
                      updateRow(row.id, { to: toNumberOrEmpty(e.target.value) })
                    }
                  />
                </td>
                <td className="border-b border-border p-0">
                  {isAmount ? (
                    <MoneyInput
                      className={CELL_INPUT_CLASS}
                      value={row.value}
                      onChange={(v) => updateRow(row.id, { value: v })}
                    />
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      className={CELL_INPUT_CLASS}
                      value={row.value}
                      onChange={(e) =>
                        updateRow(row.id, {
                          value: toNumberOrEmpty(e.target.value),
                        })
                      }
                    />
                  )}
                </td>
                <td className="border-b border-l border-border p-0">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      aria-label="Nhân bản dòng"
                      onClick={() => duplicateRow(row.id)}
                      className="p-2 text-muted-foreground hover:text-primary"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Xóa dòng"
                      disabled={value.length <= 1}
                      onClick={() => removeRow(row.id)}
                      className="p-2 text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={addRow}>
          <Plus className="mr-1.5 h-4 w-4" />
          Thêm dòng
        </Button>
      </div>
    </div>
  );
}
