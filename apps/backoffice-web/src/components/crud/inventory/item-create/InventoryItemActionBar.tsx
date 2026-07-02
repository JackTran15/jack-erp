import { Button, cn } from "@erp/ui";
import { Copy, Plus, Save, X } from "lucide-react";
import { useLayout } from "../../../layout/LayoutContext";

export type InventoryItemSaveMode = "save" | "save-and-clone" | "save-and-new";

interface InventoryItemActionBarProps {
  isSaving: boolean;
  onCancel: () => void;
  /** Called with the chosen mode; parent is responsible for triggering form submission. */
  onSaveMode: (mode: InventoryItemSaveMode) => void;
}

/** Fixed bottom action bar (below content area after sidebar). */
export function InventoryItemActionBar({ isSaving, onCancel, onSaveMode }: InventoryItemActionBarProps) {
  const { sidebarCollapsed } = useLayout();

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 z-40 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 px-2 py-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.12)] backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:px-3 lg:px-4",
        sidebarCollapsed ? "left-[60px]" : "left-60",
      )}
    >
      <Button type="button" disabled={isSaving} onClick={() => onSaveMode("save")}>
        <Save className="mr-1.5 h-4 w-4" />
        {isSaving ? "Đang lưu…" : "Lưu"}
      </Button>
      <Button type="button" variant="outline" disabled={isSaving} onClick={() => onSaveMode("save-and-clone")}>
        <Copy className="mr-1.5 h-4 w-4" />
        Lưu và nhân bản
      </Button>
      <Button type="button" variant="outline" disabled={isSaving} onClick={() => onSaveMode("save-and-new")}>
        <Plus className="mr-1.5 h-4 w-4" />
        Lưu và thêm mới
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        <X className="mr-1.5 h-4 w-4" />
        Hủy bỏ
      </Button>
    </div>
  );
}
