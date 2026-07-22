import { Button, Input } from "@erp/ui";
import { Plus, Trash2 } from "lucide-react";
import { blankBuyGetRow } from "../../../../../program-form.constants";
import type { BuyGetRow } from "../../../../../program-form.types";

interface Props {
  value: BuyGetRow[];
  onChange: (rows: BuyGetRow[]) => void;
  codeLabel: string;
  nameLabel: string;
  quantityLabel: string;
}

const CELL_INPUT_CLASS =
  "h-9 rounded-none border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset";

const toNumberOrEmpty = (raw: string): number | "" =>
  raw === "" ? "" : Number(raw);

/** Grid 4 cột dùng chung cho 2 cột của loại "Mua m tặng n" (spec 4.17/4.19). Không marker *, không prefix ≤. */
export function BuyGetProductGrid({
  value,
  onChange,
  codeLabel,
  nameLabel,
  quantityLabel,
}: Props) {
  const updateRow = (id: string, patch: Partial<BuyGetRow>) => {
    onChange(value.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    onChange(value.filter((row) => row.id !== id));
  };

  const addRow = () => {
    onChange([...value, blankBuyGetRow()]);
  };

  return (
    <div className="rounded border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-center font-bold text-foreground">
              <th className="border-b border-r border-border px-3 py-2">
                {codeLabel}
              </th>
              <th className="border-b border-r border-border px-3 py-2">
                {nameLabel}
              </th>
              <th className="w-[18%] border-b border-r border-border px-3 py-2">
                Đơn vị tính
              </th>
              <th className="w-[14%] border-b border-border px-3 py-2">
                {quantityLabel}
              </th>
              <th className="w-10 border-b border-l border-border px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {value.map((row) => (
              <tr key={row.id}>
                <td className="border-b border-r border-border p-0">
                  <Input
                    className={CELL_INPUT_CLASS}
                    value={row.code}
                    onChange={(e) => updateRow(row.id, { code: e.target.value })}
                  />
                </td>
                <td className="border-b border-r border-border p-0">
                  <Input
                    className={CELL_INPUT_CLASS}
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                </td>
                <td className="border-b border-r border-border p-0">
                  <Input
                    className={CELL_INPUT_CLASS}
                    value={row.unit}
                    onChange={(e) => updateRow(row.id, { unit: e.target.value })}
                  />
                </td>
                <td className="border-b border-border p-0">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className={`${CELL_INPUT_CLASS} text-right tabular-nums`}
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(row.id, {
                        quantity: toNumberOrEmpty(e.target.value),
                      })
                    }
                  />
                </td>
                <td className="border-b border-l border-border p-0 text-center">
                  <button
                    type="button"
                    aria-label="Xóa dòng"
                    disabled={value.length <= 1}
                    onClick={() => removeRow(row.id)}
                    className="p-2 text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
