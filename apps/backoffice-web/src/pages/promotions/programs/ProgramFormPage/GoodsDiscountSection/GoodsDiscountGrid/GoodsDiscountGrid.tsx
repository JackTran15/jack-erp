import { Button, Input, MoneyInput } from "@erp/ui";
import { Copy, Plus, Trash2 } from "lucide-react";
import {
  GOODS_DISCOUNT_METHOD_OPTIONS,
  blankGoodsDiscountRow,
} from "../../../program-form.constants";
import type {
  GoodsDiscountMethod,
  GoodsDiscountRow,
  ProgramFormState,
} from "../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

const CELL_INPUT_CLASS =
  "h-9 rounded-none border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset";

/** Bảng thiết lập giảm giá hàng hóa: hàng "Thiết lập" (phương thức) + bảng dòng hàng hóa. */
export function GoodsDiscountGrid({ form, onChange }: Props) {
  const rows = form.goodsDiscountRows;
  const isGroup = form.goodsDiscountScope === "GROUP";
  const method = form.goodsDiscountMethod;
  const isPercent = method === "PERCENT";
  const isAmount = method === "AMOUNT";
  const isFixedPrice = method === "FIXED_PRICE";

  const setMethod = (value: GoodsDiscountMethod) =>
    onChange({ goodsDiscountMethod: value });

  const updateRow = (id: string, patch: Partial<GoodsDiscountRow>) => {
    onChange({
      goodsDiscountRows: rows.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  };

  const removeRow = (id: string) => {
    onChange({ goodsDiscountRows: rows.filter((row) => row.id !== id) });
  };

  const duplicateRow = (id: string) => {
    const source = rows.find((row) => row.id === id);
    if (!source) return;
    const copy: GoodsDiscountRow = { ...source, id: crypto.randomUUID() };
    const index = rows.findIndex((row) => row.id === id);
    const next = [...rows];
    next.splice(index + 1, 0, copy);
    onChange({ goodsDiscountRows: next });
  };

  const addRow = () => {
    onChange({ goodsDiscountRows: [...rows, blankGoodsDiscountRow()] });
  };

  const codeLabel = isGroup ? "Mã nhóm hàng hóa" : "Mã hàng";
  const nameLabel = isGroup ? "Tên nhóm hàng hóa" : "Tên hàng hóa";
  const valueLabel = isAmount ? "Số tiền giảm" : "% giảm giá";

  return (
    <div className="rounded border border-border">
      {/* Hàng "Thiết lập" */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-muted px-3 py-2 text-sm">
        <span className="font-bold text-foreground">Thiết lập</span>
        {GOODS_DISCOUNT_METHOD_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="radio"
              name="goods-discount-method"
              className="shrink-0 accent-primary"
              checked={method === opt.value}
              onChange={() => setMethod(opt.value)}
            />
            {opt.label}
          </label>
        ))}
        <MoneyInput
          className="w-40"
          disabled={!isFixedPrice}
          value={form.goodsFixedPrice}
          onChange={(v) => onChange({ goodsFixedPrice: v })}
        />
      </div>

      {/* Bảng dòng hàng hóa */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-center font-bold text-foreground">
              <th className="w-[28%] border-b border-r border-border px-3 py-2">
                {codeLabel}
                <span className="ml-0.5 text-destructive">*</span>
              </th>
              <th className="w-[45%] border-b border-r border-border px-3 py-2">
                {nameLabel}
                <span className="ml-0.5 text-destructive">*</span>
              </th>
              <th className="w-[20%] border-b border-border px-3 py-2">
                {valueLabel}
              </th>
              <th className="w-16 border-b border-l border-border px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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
                  {isAmount ? (
                    <MoneyInput
                      className={`${CELL_INPUT_CLASS} text-right`}
                      value={row.value}
                      onChange={(v) => updateRow(row.id, { value: v })}
                    />
                  ) : (
                    <div className="flex items-center">
                      <span className="px-2 text-muted-foreground">≤</span>
                      <Input
                        type="number"
                        min={0}
                        className={`${CELL_INPUT_CLASS} text-right tabular-nums`}
                        disabled={isFixedPrice}
                        value={isPercent ? row.value : ""}
                        onChange={(e) =>
                          updateRow(row.id, {
                            value:
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                          })
                        }
                      />
                    </div>
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
                      disabled={rows.length <= 1}
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
