import { cn } from "@erp/ui";
import type {
  PosProductAttribute,
  PosProductVariant,
} from "@erp/pos/interfaces/catalog.interface";

export interface VariantFilterChipsProps {
  /** Các chiều thuộc tính của product (vd "Màu", "Size"). */
  attributes: PosProductAttribute[];
  /** Toàn bộ biến thể — để đếm số biến thể theo từng option. */
  variants: PosProductVariant[];
  /** Bộ lọc đang chọn theo từng chiều (Set rỗng/không có = chọn "Tất cả"). */
  filters: Record<string, Set<string>>;
  /** Toggle 1 option; `value = null` nghĩa là "Tất cả {dimension}" (xóa lọc chiều đó). */
  onToggle: (dimension: string, value: string | null) => void;
}

function countVariants(
  variants: PosProductVariant[],
  dimension: string,
  value: string,
): number {
  return variants.filter((v) =>
    v.attributes.some((a) => a.name === dimension && a.value === value),
  ).length;
}

const chipBase =
  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2";

/**
 * Hai+ hàng chip lọc biến thể theo từng chiều thuộc tính (màu / size...). Mỗi
 * hàng có chip "Tất cả {chiều}" + 1 chip/option kèm badge đếm số biến thể.
 * Multi-select trong cùng một chiều. Ẩn hoàn toàn khi product không có thuộc tính.
 */
export function VariantFilterChips({
  attributes,
  variants,
  filters,
  onToggle,
}: VariantFilterChipsProps) {
  if (attributes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {attributes.map((attr) => {
        const selected = filters[attr.name];
        const allActive = !selected || selected.size === 0;
        return (
          <div key={attr.name} className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-pressed={allActive}
              onClick={() => onToggle(attr.name, null)}
              className={cn(
                chipBase,
                allActive
                  ? "bg-[#5B5BF0] text-white"
                  : "border border-[#E5E7EB] bg-white text-[#1F2937] hover:bg-[#F9FAFB] hover:border-[#D1D5DB]",
              )}
            >
              {`Tất cả ${attr.name.toLowerCase()}`}
            </button>

            {attr.options.map((value) => {
              const active = Boolean(selected?.has(value));
              const count = countVariants(variants, attr.name, value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle(attr.name, value)}
                  className={cn(
                    chipBase,
                    active
                      ? "bg-[#5B5BF0] text-white"
                      : "border border-[#E5E7EB] bg-white text-[#1F2937] hover:bg-[#F9FAFB] hover:border-[#D1D5DB]",
                  )}
                >
                  {value}
                  <span
                    className={cn(
                      "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[12px] font-semibold",
                      active
                        ? "bg-white text-[#5B5BF0]"
                        : "bg-[#E5E7EB] text-[#1F2937]",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
