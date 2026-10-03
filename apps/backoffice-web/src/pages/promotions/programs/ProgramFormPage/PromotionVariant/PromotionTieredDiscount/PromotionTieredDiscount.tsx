import { useIsChainSelected } from "../../../../../../store/common/branch/branch.store";
import { usePromotionFormMode } from "../../promotion-form-mode.context";
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
  // CTKM của chi nhánh: hiện phạm vi (đã khoá) cả khi đang xem một chi nhánh (AC-04).
  const { branchLock, readOnly } = usePromotionFormMode();

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
      {/* Chỉ xem (AC-09): khoá mọi ô; tab nằm ngoài nên vẫn chuyển được. */}
      <fieldset disabled={readOnly} className="contents">
        <div className="w-full flex flex-col gap-5">
          <GeneralInfoPromotionSection form={form} onChange={onChange} />
          <TimePromotionSection form={form} onChange={onChange} />
          {isChain || branchLock ? (
            <StoreScopePromotionSection form={form} onChange={onChange} />
          ) : null}
          <TieredDiscountPromotionSection form={form} onChange={onChange} />
        </div>
      </fieldset>
    </div>
  );
}
