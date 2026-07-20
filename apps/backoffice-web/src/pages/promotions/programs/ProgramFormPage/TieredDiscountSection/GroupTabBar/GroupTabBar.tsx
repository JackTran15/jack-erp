import { cn } from "@erp/ui";
import { X } from "lucide-react";
import type { TierGroup } from "../../../program-form.types";

interface Props {
  groups: TierGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

/** Tab bar cấp nhóm (underline + nút X xóa trong tab). Không dùng được generic Tabs vì cần nút xóa. */
export function GroupTabBar({ groups, activeId, onSelect, onRemove }: Props) {
  const canRemove = groups.length > 1;

  return (
    <div className="flex items-center gap-1 border-b border-border bg-muted">
      {groups.map((group) => {
        const isActive = group.id === activeId;
        return (
          <div
            key={group.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm",
              isActive
                ? "-mb-px border-b-2 border-primary bg-background text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            <button
              type="button"
              className="cursor-pointer"
              onClick={() => onSelect(group.id)}
            >
              {group.name}
            </button>
            <button
              type="button"
              aria-label={`Xóa ${group.name}`}
              disabled={!canRemove}
              onClick={() => onRemove(group.id)}
              className="text-destructive hover:opacity-70 disabled:pointer-events-none disabled:opacity-30"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
