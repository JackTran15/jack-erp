import { useMemo } from "react";
import { Button, Input, MoneyInput } from "@erp/ui";
import { Plus, Trash2 } from "lucide-react";
import { LookupField } from "../../../forms/LookupField";
import { useItemUnits } from "./hooks";

export interface ConversionUnitRow {
  id: string;
  unitName: string;
  ratio: string;
  description: string;
  buyPrice: string;
  sellPrice: string;
  defaultSell: boolean;
  defaultBuy: boolean;
}

interface Props {
  rows: ConversionUnitRow[];
  setRows: React.Dispatch<React.SetStateAction<ConversionUnitRow[]>>;
}

export function createBlankConversionUnitRow(): ConversionUnitRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    unitName: "",
    ratio: "0",
    description: "",
    buyPrice: "0",
    sellPrice: "0",
    defaultSell: false,
    defaultBuy: false,
  };
}

export function ConversionUnitsTable({ rows, setRows }: Props) {
  const unitsQuery = useItemUnits("", true);

  const unitOptions = useMemo(() => {
    const data = (unitsQuery.data?.data ?? []) as Record<string, unknown>[];
    const set = new Set(data.map((r) => String(r.name ?? "")).filter(Boolean));
    rows.forEach((r) => {
      if (r.unitName) set.add(r.unitName);
    });
    return [...set];
  }, [unitsQuery.data, rows]);

  const updateRow = (id: string, patch: Partial<ConversionUnitRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => {
    setRows((prev) => [...prev, createBlankConversionUnitRow()]);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 uppercase">
            <tr>
              <th className="px-2 py-2 text-left">Tên đơn vị tính</th>
              <th className="px-2 py-2 text-right">Tỷ lệ quy đổi</th>
              <th className="px-2 py-2 text-left">Mô tả</th>
              <th className="px-2 py-2 text-right">Giá mua</th>
              <th className="px-2 py-2 text-right">Giá bán</th>
              <th className="px-2 py-2 text-center">Đơn vị bán mặc định</th>
              <th className="px-2 py-2 text-center">Đơn vị nhập mặc định</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-2 py-1.5">
                  <LookupField<string>
                    portalToBody
                    value={row.unitName}
                    onValueChange={(v) => updateRow(row.id, { unitName: v })}
                    onSelect={(u) => updateRow(row.id, { unitName: u })}
                    search={(q) =>
                      Promise.resolve(
                        unitOptions.filter((u) =>
                          u.toLowerCase().includes(q.trim().toLowerCase()),
                        ),
                      )
                    }
                    itemKey={(u) => u}
                    renderItem={(u) => u}
                    placeholder="Chọn đơn vị"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={row.ratio}
                    onChange={(e) => updateRow(row.id, { ratio: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    value={row.description}
                    onChange={(e) => updateRow(row.id, { description: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput
                    className="text-right"
                    value={row.buyPrice === "" ? "" : Number(row.buyPrice)}
                    onChange={(v) =>
                      updateRow(row.id, { buyPrice: v === "" ? "" : String(v) })
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput
                    className="text-right"
                    value={row.sellPrice === "" ? "" : Number(row.sellPrice)}
                    onChange={(v) =>
                      updateRow(row.id, { sellPrice: v === "" ? "" : String(v) })
                    }
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.defaultSell}
                    onChange={(e) => updateRow(row.id, { defaultSell: e.target.checked })}
                    className="h-4 w-4 rounded border border-input accent-primary"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.defaultBuy}
                    onChange={(e) => updateRow(row.id, { defaultBuy: e.target.checked })}
                    className="h-4 w-4 rounded border border-input accent-primary"
                  />
                </td>
                <td className="px-1 py-1.5 text-right">
                  <button
                    type="button"
                    aria-label="Xóa dòng"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs italic text-muted-foreground">
          (Nếu không chọn Đơn vị bán/nhập mặc định thì chương trình sẽ lấy Đơn vị tính cơ bản làm
          Đơn vị bán/nhập mặc định.)
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" /> Thêm dòng
        </Button>
      </div>
    </>
  );
}
