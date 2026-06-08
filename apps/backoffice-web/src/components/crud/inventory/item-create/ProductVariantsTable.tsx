import { Input, MoneyInput } from "@erp/ui";
import { ArrowDownToLine, ImageIcon, ScanBarcode, Trash2 } from "lucide-react";

export const VARIANT_DEFAULT_UNIT = "Chiếc";

export interface ProductVariantRow {
  id: string;
  itemId?: string;
  color: string;
  size: string;
  name: string;
  unit: string;
  sku: string;
  barcode: string;
  purchasePrice: string;
  sellPrice: string;
  initialStock: string;
}

interface Props {
  rows: ProductVariantRow[];
  setRows: React.Dispatch<React.SetStateAction<ProductVariantRow[]>>;
  onRemove: (row: ProductVariantRow) => void;
  onCopyPriceDown: (row: ProductVariantRow) => void;
}

/** Build display groups so the image cell can `rowSpan` across rows sharing a color. */
function buildColorGroups(rows: ProductVariantRow[]): Map<number, number> {
  // Maps the index of the first row of each color group -> group size.
  const firstIndexToSpan = new Map<number, number>();
  let groupStart = 0;
  for (let i = 0; i <= rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const sameGroup = i > 0 && curr && prev && prev.color === curr.color;
    if (i === rows.length || !sameGroup) {
      if (i > 0) firstIndexToSpan.set(groupStart, i - groupStart);
      groupStart = i;
    }
  }
  return firstIndexToSpan;
}

export function ProductVariantsTable({ rows, setRows, onRemove, onCopyPriceDown }: Props) {
  const updateRow = (id: string, patch: Partial<ProductVariantRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const colorGroups = buildColorGroups(rows);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/50 uppercase">
          <tr>
            <th className="w-24 px-2 py-2 text-center font-semibold">Ảnh</th>
            <th className="px-2 py-2 text-left font-semibold">Tên hàng hóa</th>
            <th className="w-24 px-2 py-2 text-left font-semibold">Đơn vị tính</th>
            <th className="w-28 px-2 py-2 text-left font-semibold">Mã SKU</th>
            <th className="w-32 px-2 py-2 text-left font-semibold">Mã vạch</th>
            <th className="w-28 px-2 py-2 text-right font-semibold">Giá mua</th>
            <th className="w-40 px-2 py-2 text-right font-semibold">Giá bán</th>
            <th className="w-32 px-2 py-2 text-right font-semibold">Tồn kho ban đầu</th>
            <th className="w-10 px-1 py-2" />
            <th className="w-10 px-1 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const span = colorGroups.get(index);
            return (
              <tr key={row.id} className="border-t border-border align-top">
                {span !== undefined && (
                  <td className="px-2 py-2 text-center" rowSpan={span}>
                    <button
                      type="button"
                      aria-label="Thêm ảnh cho phiên bản"
                      className="mx-auto flex h-16 w-16 flex-col items-center justify-center gap-1 rounded border border-dashed border-indigo-500 bg-background text-muted-foreground hover:bg-indigo-50"
                    >
                      <ImageIcon className="h-5 w-5 text-muted-foreground/60" />
                      <span className="rounded bg-indigo-900 px-2 py-0.5 text-[11px] font-medium leading-none text-white">
                        ...
                      </span>
                    </button>
                  </td>
                )}
                <td className="px-2 py-1.5">
                  <Input
                    className="text-muted-foreground"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <span className="text-muted-foreground">{row.unit}</span>
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    value={row.sku}
                    onChange={(e) => updateRow(row.id, { sku: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    value={row.barcode}
                    onChange={(e) => updateRow(row.id, { barcode: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput
                    className="text-right"
                    value={row.purchasePrice === "" ? "" : Number(row.purchasePrice)}
                    onChange={(v) =>
                      updateRow(row.id, { purchasePrice: v === "" ? "" : String(v) })
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <MoneyInput
                      className="flex-1 text-right"
                      value={row.sellPrice === "" ? "" : Number(row.sellPrice)}
                      onChange={(v) =>
                        updateRow(row.id, { sellPrice: v === "" ? "" : String(v) })
                      }
                    />
                    <ScanBarcode
                      className="h-4 w-4 shrink-0 text-indigo-600"
                      aria-label="Thiết lập giá theo nhóm"
                    />
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={row.initialStock}
                    onChange={(e) => updateRow(row.id, { initialStock: e.target.value })}
                  />
                </td>
                <td className="px-1 py-1.5 text-center">
                  <button
                    type="button"
                    aria-label="Sao chép giá xuống các dòng dưới"
                    title="Sao chép giá xuống các dòng dưới"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-indigo-600 hover:bg-indigo-50"
                    onClick={() => onCopyPriceDown(row)}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                  </button>
                </td>
                <td className="px-1 py-1.5 text-center">
                  <button
                    type="button"
                    aria-label="Xóa biến thể"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                    onClick={() => onRemove(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={10}
                className="px-3 py-6 text-center text-sm text-muted-foreground"
              >
                Nhập Màu sắc/Size để tạo phiên bản.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
