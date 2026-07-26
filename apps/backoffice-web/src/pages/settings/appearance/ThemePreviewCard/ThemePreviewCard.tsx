import { Check } from "lucide-react";
import { cn } from "@erp/ui";
import type { ThemeOption } from "../../../../store/common/theme/theme.interface";

interface Props {
  theme: ThemeOption;
  selected: boolean;
  onSelect: () => void;
}

/**
 * Thẻ chọn theme. Phần preview bọc trong <div data-theme={id}> nên nó render
 * bằng đúng token của theme đó — thêm theme mới là tự có preview, không phải
 * khai swatch bằng tay.
 */
export function ThemePreviewCard({ theme, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border text-left transition-all",
        selected
          ? "border-primary-blue ring-2 ring-ring"
          : "border-border hover:border-muted-foreground/50",
      )}
    >
      <div data-theme={theme.id} className="bg-background p-3">
        <ThemeMiniature />
      </div>

      <div className="flex items-start gap-2 border-t border-border bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{theme.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {theme.description}
          </p>
        </div>
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-primary-blue bg-primary-blue text-primary-blue-foreground"
              : "border-border",
          )}
        >
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </div>
    </button>
  );
}

/** Bản thu nhỏ của giao diện thật: chrome, sidebar, card, nút, badge trạng thái. */
function ThemeMiniature() {
  return (
    <div className="overflow-hidden rounded border border-border">
      <div className="flex h-5 items-center gap-1 bg-sidebar px-1.5">
        <span className="h-1.5 w-6 rounded-sm bg-sidebar-foreground/70" />
        <span className="ml-auto h-1.5 w-4 rounded-sm bg-sidebar-muted-foreground" />
      </div>

      <div className="flex h-[74px]">
        <div className="flex w-9 flex-col gap-1 bg-sidebar p-1">
          <span className="h-2.5 rounded-sm bg-sidebar-active" />
          <span className="h-2.5 rounded-sm bg-sidebar-accent" />
          <span className="h-2.5 rounded-sm bg-sidebar-accent" />
        </div>

        <div className="flex flex-1 flex-col gap-1.5 bg-background p-1.5">
          <div className="flex flex-col gap-1 rounded border border-border bg-card p-1.5">
            <span className="h-1.5 w-2/3 rounded-sm bg-foreground" />
            <span className="h-1.5 w-1/2 rounded-sm bg-muted-foreground" />
            <span className="h-1.5 w-full rounded-sm bg-muted" />
          </div>
          <div className="flex items-center gap-1">
            <span className="h-3 w-8 rounded-sm bg-primary-blue" />
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="h-2 w-2 rounded-full bg-warning" />
            <span className="h-2 w-2 rounded-full bg-info" />
            <span className="h-2 w-2 rounded-full bg-destructive" />
          </div>
        </div>
      </div>
    </div>
  );
}
