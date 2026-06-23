import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@erp/ui";
import { HelpCircle } from "lucide-react";

interface Props {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function ComboAllocationCheckbox({ value, onChange }: Props) {
  return (
    <div className="flex items-start gap-2 text-xs text-foreground">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        Phân bổ doanh thu, khuyến mại, thuế của các hàng hóa trong combo
      </label>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Giải thích phân bổ combo"
              className="mt-0.5 text-muted-foreground"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Khi bật, doanh thu, khuyến mại và thuế của combo sẽ được phân bổ về
            từng hàng hóa thành phần bên trong combo.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
