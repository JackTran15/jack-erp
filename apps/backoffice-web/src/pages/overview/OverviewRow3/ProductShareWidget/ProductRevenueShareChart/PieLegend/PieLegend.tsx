import { cn } from "@erp/ui";
import { CHART_COLOR } from "../../../../_lib/echarts/baseOption";
import { formatViNumber } from "../../../../_lib/format";
import type { ShareSlice } from "../../../../_api/overview.interface";

interface Props {
  slices: ShareSlice[];
  colors: readonly string[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  /** Hiện thêm giá trị sau tên: "Tên: 1.250" (widget tỉ trọng theo chi nhánh). */
  showValue?: boolean;
}

/** Legend dọc bên phải pie — mặc định chỉ tên, không hiện giá trị (theo spec). */
export function PieLegend({ slices, colors, hiddenKeys, onToggle, showValue }: Props) {
  return (
    <ul className="flex max-h-[80%] shrink-0 flex-col gap-4 overflow-y-auto pr-2">
      {slices.map((slice, index) => {
        const hidden = hiddenKeys.includes(slice.key);
        return (
          <li key={slice.key}>
            <button
              type="button"
              onClick={() => onToggle(slice.key)}
              aria-pressed={!hidden}
              className="flex items-center gap-4 text-left"
            >
              <span
                className="h-6 w-6 shrink-0 rounded-full"
                style={{
                  backgroundColor: hidden
                    ? CHART_COLOR.disabled
                    : colors[index % colors.length],
                }}
              />
              <span
                className={cn(
                  "line-clamp-2 max-w-[240px] text-[13px] font-medium leading-5",
                  hidden ? "text-[#9E9E9E]" : "text-[#212121]",
                )}
              >
                {slice.label}
                {showValue ? (
                  <>
                    : <strong className="font-bold tabular-nums">{formatViNumber(slice.value)}</strong>
                  </>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
