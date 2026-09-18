import type { TopProductsSortBy } from "../../../../../store/page-stores/overview/overview.interface";
import { OptionsRadioGroup } from "../../../WidgetOptionsModal/OptionsRadioGroup/OptionsRadioGroup";

interface Props {
  value: TopProductsSortBy;
  onChange: (value: TopProductsSortBy) => void;
  /** Khoá radio trong lúc đang tải lại danh sách. */
  disabled?: boolean;
}

/**
 * Thanh "Sắp xếp theo" của bảng "Hàng hóa bán chạy" — nằm ngoài modal, ngay
 * dưới header widget.
 */
export function SortByBar({ value, onChange, disabled }: Props) {
  return (
    <div
      className="mb-2 grid h-12 grid-cols-[104px_1fr] items-center rounded-sm bg-[#EEEEEE] px-2"
      aria-busy={disabled}
    >
      <span className="text-[13px] leading-5 text-[#212121]">Sắp xếp theo</span>
      <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
        <OptionsRadioGroup
          name="top-products-sort"
          ariaLabel="Sắp xếp theo"
          value={value}
          options={[
            { value: "revenue", label: "Doanh thu" },
            { value: "quantity", label: "Số lượng" },
          ]}
          onChange={(v) => onChange(v as TopProductsSortBy)}
        />
      </div>
    </div>
  );
}
