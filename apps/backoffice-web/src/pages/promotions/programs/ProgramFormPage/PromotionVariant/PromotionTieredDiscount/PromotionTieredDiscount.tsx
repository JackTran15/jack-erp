import { useIsChainSelected } from "../../../../../../store/common/branch/branch.store";
import { GeneralInfoPromotionSection } from "../_PromotionSections/GeneralInfoPromotionSection/GeneralInfoPromotionSection";
import { TimePromotionSection } from "../_PromotionSections/TimePromotionSection/TimePromotionSection";
import { StoreScopePromotionSection } from "../_PromotionSections/StoreScopePromotionSection/StoreScopePromotionSection";
import { TieredDiscountPromotionSection } from "../_PromotionSections/TieredDiscountPromotionSection/TieredDiscountPromotionSection";
import type { ProgramFormState } from "../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function PromotionTieredDiscount({ form, onChange }: Props) {
  const isChain = useIsChainSelected();

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
      <div className="w-full flex flex-col gap-5">
        <GeneralInfoPromotionSection form={form} onChange={onChange} />
        <TimePromotionSection form={form} onChange={onChange} />
        {isChain ? (
          <StoreScopePromotionSection form={form} onChange={onChange} />
        ) : null}
        <TieredDiscountPromotionSection form={form} onChange={onChange} />
      </div>
    </div>
  );
}
