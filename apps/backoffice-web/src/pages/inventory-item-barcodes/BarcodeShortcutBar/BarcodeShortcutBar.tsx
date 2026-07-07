import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

interface ShortcutPillProps {
  children: ReactNode;
}

function ShortcutPill({ children }: ShortcutPillProps) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-muted-foreground px-3 text-xs font-medium text-background">
      {children}
    </span>
  );
}

/** Thanh chú giải phím tắt dưới bảng in tem (hiển thị tĩnh). */
export function BarcodeShortcutBar() {
  return (
    <div className="flex items-center justify-between gap-4 border-t bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <ShortcutPill>Ctrl + Insert</ShortcutPill>
        <span className="text-[13px] italic text-muted-foreground">
          Thêm dòng
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ShortcutPill>Ctrl + Delete</ShortcutPill>
        <span className="text-[13px] italic text-muted-foreground">
          Xóa dòng hiện tại
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ShortcutPill>Ctrl + F3</ShortcutPill>
        <span className="text-[13px] italic text-muted-foreground">
          Tìm kiếm nâng cao
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ShortcutPill>
          <ArrowUp className="h-3 w-3" />
        </ShortcutPill>
        <span className="text-[13px] italic text-muted-foreground">hoặc</span>
        <ShortcutPill>
          <ArrowDown className="h-3 w-3" />
        </ShortcutPill>
        <span className="text-[13px] italic text-muted-foreground">
          Tăng giảm số lượng
        </span>
      </div>
    </div>
  );
}
