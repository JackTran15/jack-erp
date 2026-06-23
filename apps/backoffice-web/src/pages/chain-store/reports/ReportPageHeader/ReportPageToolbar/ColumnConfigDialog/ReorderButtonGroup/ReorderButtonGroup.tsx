import { Button } from "@erp/ui";
import { ArrowDown, ArrowUp } from "lucide-react";

interface Props {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}

// Cặp nút di chuyển dòng đang chọn lên/xuống (spec ReorderButtonGroup).
export function ReorderButtonGroup({ canUp, canDown, onUp, onDown }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label="Di chuyển cột lên"
        disabled={!canUp}
        onClick={onUp}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label="Di chuyển cột xuống"
        disabled={!canDown}
        onClick={onDown}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
