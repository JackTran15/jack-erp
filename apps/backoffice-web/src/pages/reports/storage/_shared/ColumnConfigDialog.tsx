import { useEffect, useState } from "react";
import { AppModal, Button } from "@erp/ui";
import { ArrowDown, ArrowUp, HelpCircle, RotateCcw, Save, X } from "lucide-react";

export interface ColumnConfigEntry {
  key: string;
  label: string;
  visible: boolean;
  frozen: boolean;
  /** User-resized width in pixels. When undefined, the column's default width is used. */
  width?: number;
}

export interface ColumnConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Page title shown above the table (e.g. "TỔNG HỢP NHẬP XUẤT TỒN KHO"). */
  reportTitle: string;
  value: ColumnConfigEntry[];
  /** Reference order/visibility used by the "Lấy mẫu ngầm định" button. */
  defaults: ColumnConfigEntry[];
  onSave: (next: ColumnConfigEntry[]) => void;
}

export function ColumnConfigDialog({
  open,
  onOpenChange,
  reportTitle,
  value,
  defaults,
  onSave,
}: ColumnConfigDialogProps) {
  const [draft, setDraft] = useState<ColumnConfigEntry[]>(value);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setSelected(value[0]?.key ?? null);
    }
  }, [open, value]);

  const allVisible = draft.every((c) => c.visible);
  const allFrozen = draft.every((c) => c.frozen);

  const update = (key: string, patch: Partial<ColumnConfigEntry>) =>
    setDraft((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const move = (dir: -1 | 1) => {
    if (!selected) return;
    const idx = draft.findIndex((c) => c.key === selected);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= draft.length) return;
    setDraft((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item!);
      return copy;
    });
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Sửa mẫu"
      defaultWidth={780}
      defaultHeight={620}
      showFooter={false}
    >
      <div className="mb-3 text-sm font-semibold uppercase">{reportTitle}</div>

      <div className="flex gap-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted [&_th]:bg-muted">
                <tr>
                  <th className="border-b border-r border-border px-3 py-2 text-left font-medium">
                    Tên cột dữ liệu
                  </th>
                  <th className="border-b border-r border-border px-3 py-2 text-left font-medium">
                    Tên cột hiển thị
                  </th>
                  <th className="w-24 border-b border-r border-border px-3 py-2 text-center font-medium">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>Hiển thị</span>
                      <input
                        type="checkbox"
                        checked={allVisible}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((c) => ({ ...c, visible: e.target.checked })),
                          )
                        }
                      />
                    </div>
                  </th>
                  <th className="w-24 border-b border-border px-3 py-2 text-center font-medium">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>Cố định cột</span>
                      <input
                        type="checkbox"
                        checked={allFrozen}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((c) => ({ ...c, frozen: e.target.checked })),
                          )
                        }
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.map((c) => (
                  <tr
                    key={c.key}
                    className={`cursor-pointer border-b border-border ${
                      selected === c.key ? "bg-primary/10" : "hover:bg-muted/30"
                    }`}
                    onClick={() => setSelected(c.key)}
                  >
                    <td className="border-r border-border px-3 py-1.5">{c.label}</td>
                    <td className="border-r border-border px-3 py-1.5">{c.label}</td>
                    <td
                      className="border-r border-border px-3 py-1.5 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={c.visible}
                        onChange={(e) => update(c.key, { visible: e.target.checked })}
                      />
                    </td>
                    <td
                      className="px-3 py-1.5 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={c.frozen}
                        onChange={(e) => update(c.key, { frozen: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={() => move(-1)}
            disabled={!selected || draft[0]?.key === selected}
            aria-label="Di chuyển lên"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={() => move(1)}
            disabled={!selected || draft[draft.length - 1]?.key === selected}
            aria-label="Di chuyển xuống"
          >
            <ArrowDown className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <HelpCircle className="h-4 w-4" /> Trợ giúp
        </button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDraft(defaults)}
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Lấy mẫu ngầm định
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            <Save className="mr-1 h-4 w-4" /> Lưu
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1 h-4 w-4" /> Huỷ bỏ
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
