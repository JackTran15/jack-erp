import { useIsChainSelected } from "../../../../../../store/common/branch/branch.store";
import { GeneralInfoPromotionSection } from "../_PromotionSections/GeneralInfoPromotionSection/GeneralInfoPromotionSection";
import { TimePromotionSection } from "../_PromotionSections/TimePromotionSection/TimePromotionSection";
import { StoreScopePromotionSection } from "../_PromotionSections/StoreScopePromotionSection/StoreScopePromotionSection";
import { BuyGetPromotionSection } from "../_PromotionSections/BuyGetPromotionSection/BuyGetPromotionSection";
import type { ProgramFormState } from "../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function PromotionBuyGet({ form, onChange }: Props) {
  const isChain = useIsChainSelected();

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
      <div className="flex flex-col gap-5">
        <GeneralInfoPromotionSection form={form} onChange={onChange} />
        <TimePromotionSection form={form} onChange={onChange} />
        {isChain ? (
          <StoreScopePromotionSection form={form} onChange={onChange} />
        ) : null}
        <BuyGetPromotionSection form={form} onChange={onChange} />
      </div>
    </div>
  );
}
