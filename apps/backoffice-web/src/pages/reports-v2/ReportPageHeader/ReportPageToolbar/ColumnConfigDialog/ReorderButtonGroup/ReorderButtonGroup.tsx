import { ArrowDown, ArrowUp } from "lucide-react";

interface Props {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}

const buttonClass =
  "flex h-9 w-9 items-center justify-center rounded-[3px] bg-[#2D3A8C] text-white disabled:cursor-not-allowed disabled:bg-[#A9AFD6]";

// Cặp nút di chuyển dòng đang chọn lên/xuống (spec ReorderButtonGroup).
export function ReorderButtonGroup({ canUp, canDown, onUp, onDown }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        aria-label="Di chuyển cột lên"
        className={buttonClass}
        disabled={!canUp}
        onClick={onUp}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Di chuyển cột xuống"
        className={buttonClass}
        disabled={!canDown}
        onClick={onDown}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  );
}
