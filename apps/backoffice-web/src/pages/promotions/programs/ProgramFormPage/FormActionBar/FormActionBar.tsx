import { Button, cn } from "@erp/ui";
import { Plus, Save, X } from "lucide-react";

interface Props {
  onSave: () => void;
  onSaveAndNew: () => void;
  onCancel: () => void;
  /** "top" dùng border-bottom, "bottom" dùng border-top. */
  position: "top" | "bottom";
}

/** Thanh hành động Lưu / Lưu và thêm mới / Hủy bỏ, lặp lại ở đầu và cuối form. */
export function FormActionBar({
  onSave,
  onSaveAndNew,
  onCancel,
  position,
}: Props) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 bg-background px-2 py-3",
        position === "top" ? "border-b" : "border-t",
      )}
    >
      <Button type="button" onClick={onSave}>
        <Save className="mr-1.5 h-4 w-4" />
        Lưu
      </Button>
      <Button type="button" variant="outline" onClick={onSaveAndNew}>
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
