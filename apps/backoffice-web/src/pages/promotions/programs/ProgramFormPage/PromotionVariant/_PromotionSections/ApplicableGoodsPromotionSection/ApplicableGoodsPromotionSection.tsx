import { Button, Input } from "@erp/ui";
import { Plus, Trash2 } from "lucide-react";
import { blankApplicableGood } from "../../../../program-form.constants";
import type { ApplicableGood } from "../../../../program-form.types";

interface Props {
  value: ApplicableGood[];
  onChange: (goods: ApplicableGood[]) => void;
}

const CELL_INPUT_CLASS = "h-9 rounded-none border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset";

export function ApplicableGoodsPromotionSection({ value, onChange }: Props) {
  const updateRow = (id: string, patch: Partial<ApplicableGood>) => {
    onChange(value.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    onChange(value.filter((row) => row.id !== id));
  };

  const addRow = () => {
    onChange([...value, blankApplicableGood()]);
  };

  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Hàng hóa áp dụng
      </h2>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-center font-bold text-foreground">
              <th className="w-[20%] border-b border-r border-border px-3 py-2">
                Mã SKU<span className="ml-0.5 text-destructive">*</span>
              </th>
              <th className="w-[45%] border-b border-r border-border px-3 py-2">
                Tên hàng hóa<span className="ml-0.5 text-destructive">*</span>
              </th>
              <th className="w-[13%] border-b border-r border-border px-3 py-2">
                Đơn vị tính<span className="ml-0.5 text-destructive">*</span>
              </th>
              <th className="w-[22%] border-b border-border px-3 py-2">
                Lớn hơn hoặc bằng số lượng
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
                    value={row.sku}
                    onChange={(e) => updateRow(row.id, { sku: e.target.value })}
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
                  <div className="flex items-center">
                    <span className="px-2 text-muted-foreground">≤</span>
                    <Input
                      type="number"
                      min={0}
                      className={`${CELL_INPUT_CLASS} text-right tabular-nums`}
                      value={row.minQuantity}
                      onChange={(e) =>
                        updateRow(row.id, {
                          minQuantity:
                            e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    />
                  </div>
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
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={addRow}>
        <Plus className="mr-1.5 h-4 w-4" />
        Thêm dòng
      </Button>
    </section>
  );
}
