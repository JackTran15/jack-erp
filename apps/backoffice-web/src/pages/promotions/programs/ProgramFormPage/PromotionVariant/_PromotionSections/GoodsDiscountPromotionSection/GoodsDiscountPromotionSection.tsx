import { AutoApplyCheckbox } from "../AutoApplyCheckbox/AutoApplyCheckbox";
import { GoodsDiscountGrid } from "./GoodsDiscountGrid/GoodsDiscountGrid";
import { GOODS_DISCOUNT_SCOPE_OPTIONS } from "../../../../program-form.constants";
import type { GoodsDiscountScope, ProgramFormState } from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

/** Section "Khuyến mại" cho loại giảm giá hàng hóa: phạm vi (nhóm/hàng hóa) + bảng thiết lập. */
export function GoodsDiscountPromotionSection({ form, onChange }: Props) {
  const setScope = (scope: GoodsDiscountScope) =>
    onChange({ goodsDiscountScope: scope });

  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Khuyến mại
      </h2>
      <div className="mb-3 flex flex-wrap items-center gap-8 text-sm">
        <span>Giảm giá theo</span>
        {GOODS_DISCOUNT_SCOPE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="radio"
              name="goods-discount-scope"
              className="shrink-0 accent-primary"
              checked={form.goodsDiscountScope === opt.value}
              onChange={() => setScope(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      <GoodsDiscountGrid form={form} onChange={onChange} />

      <AutoApplyCheckbox
        checked={form.autoApply}
        onChange={(v) => onChange({ autoApply: v })}
      />
    </section>
  );
}
