import { ConditionTypeRadioGroup } from "./ConditionTypeRadioGroup/ConditionTypeRadioGroup";
import { ApplicableGoodsGrid } from "./ApplicableGoodsGrid/ApplicableGoodsGrid";
import { ProductGroupSection } from "./ProductGroupSection/ProductGroupSection";
import type { ProgramFormState } from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
  /** Loại "Tặng hàng hóa" hiển thị thêm checkbox cấp số nhân trong cụm MIN_TOTAL. */
  showGiftMultiplier?: boolean;
}

export function ConditionPromotionSection({
  form,
  onChange,
  showGiftMultiplier = false,
}: Props) {
  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Điều kiện áp dụng
      </h2>

      <ConditionTypeRadioGroup
        form={form}
        onChange={onChange}
        showGiftMultiplier={showGiftMultiplier}
      />

      {form.conditionType === "MIN_TOTAL" &&
      form.calcBasis === "PRODUCT_GROUP" ? (
        <ProductGroupSection form={form} onChange={onChange} />
      ) : (
        <>
          <h3 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Hàng hóa áp dụng
          </h3>
          <ApplicableGoodsGrid
            value={form.applicableGoods}
            onChange={(goods) => onChange({ applicableGoods: goods })}
            disabled={form.conditionType !== "SPECIFIC_QUANTITY"}
          />
        </>
      )}
    </section>
  );
}
