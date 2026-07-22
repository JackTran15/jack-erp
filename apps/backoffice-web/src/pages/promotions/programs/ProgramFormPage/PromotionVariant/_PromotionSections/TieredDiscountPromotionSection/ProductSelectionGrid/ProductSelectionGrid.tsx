import { Button, Input } from "@erp/ui";
import { Plus, Trash2 } from "lucide-react";
import { blankTierProduct } from "../../../../../program-form.constants";
import type { TierProduct, TierTarget } from "../../../../../program-form.types";

interface Props {
  value: TierProduct[];
  onChange: (rows: TierProduct[]) => void;
  target: TierTarget;
}

const CELL_INPUT_CLASS =
  "h-9 rounded-none border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset";

const CODE_LABEL: Record<TierTarget, string> = {
  PRODUCT: "Mã SKU",
  VARIANT: "Mã mẫu mã",
  GROUP: "Mã nhóm hàng hóa",
};

const NAME_LABEL: Record<TierTarget, string> = {
  PRODUCT: "Tên hàng hóa",
  VARIANT: "Tên mẫu mã",
  GROUP: "Tên nhóm hàng hóa",
};

/** Grid chọn hàng hóa của một nhóm khuyến mại theo mức (spec 4.17). */
export function ProductSelectionGrid({ value, onChange, target }: Props) {
  const updateRow = (id: string, patch: Partial<TierProduct>) => {
    onChange(value.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    onChange(value.filter((row) => row.id !== id));
  };

  const addRow = () => {
    onChange([...value, blankTierProduct()]);
  };

  return (
    <div className="rounded border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-center font-bold text-foreground">
              <th className="w-[22%] border-b border-r border-border px-3 py-2">
                {CODE_LABEL[target]}
                <span className="ml-0.5 text-destructive">*</span>
              </th>
              <th className="border-b border-r border-border px-3 py-2">
                {NAME_LABEL[target]}
                <span className="ml-0.5 text-destructive">*</span>
              </th>
              <th className="w-[16%] border-b border-border px-3 py-2">
                Đơn vị tính<span className="ml-0.5 text-destructive">*</span>
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
                <td className="border-b border-border p-0">
                  <Input
                    className={CELL_INPUT_CLASS}
                    value={row.unit}
                    onChange={(e) => updateRow(row.id, { unit: e.target.value })}
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
