import { useState } from "react";
import { Tabs } from "../../../../../../components/tabs/Tabs";
import { useIsChainSelected } from "../../../../../../store/common/branch/branch.store";
import { GeneralInfoPromotionSection } from "../_PromotionSections/GeneralInfoPromotionSection/GeneralInfoPromotionSection";
import { TimePromotionSection } from "../_PromotionSections/TimePromotionSection/TimePromotionSection";
import { StoreScopePromotionSection } from "../_PromotionSections/StoreScopePromotionSection/StoreScopePromotionSection";
import { GoodsDiscountPromotionSection } from "../_PromotionSections/GoodsDiscountPromotionSection/GoodsDiscountPromotionSection";
import { ConditionPromotionSection } from "../_PromotionSections/ConditionPromotionSection/ConditionPromotionSection";
import { ApplicableGoodsPromotionSection } from "../_PromotionSections/ApplicableGoodsPromotionSection/ApplicableGoodsPromotionSection";
import { AutoApplyCheckbox } from "../_PromotionSections/AutoApplyCheckbox/AutoApplyCheckbox";
import type { ProgramFormState } from "../../../program-form.types";

type FormTab = "km" | "conditions";

const FORM_TABS: { id: FormTab; label: string }[] = [
  { id: "km", label: "Khuyến mại" },
  { id: "conditions", label: "Điều kiện áp dụng" },
];

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function PromotionProductDiscount({ form, onChange }: Props) {
  const isChain = useIsChainSelected();
  const [activeTab, setActiveTab] = useState<FormTab>("km");

  return (
    <>
      <Tabs tabs={FORM_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {activeTab === "km" ? (
          <div className="w-full flex flex-col gap-5">
            <GeneralInfoPromotionSection form={form} onChange={onChange} />
            <TimePromotionSection form={form} onChange={onChange} />
            {isChain ? (
              <StoreScopePromotionSection form={form} onChange={onChange} />
            ) : null}
            <GoodsDiscountPromotionSection form={form} onChange={onChange} />
          </div>
        ) : (
          <div className="w-full flex flex-col gap-5">
            <ConditionPromotionSection
              form={form}
              onChange={onChange}
              showGiftMultiplier={false}
            />
            <ApplicableGoodsPromotionSection
              value={form.applicableGoods}
              onChange={(goods) => onChange({ applicableGoods: goods })}
            />
            <AutoApplyCheckbox
              checked={form.autoApply}
              onChange={(v) => onChange({ autoApply: v })}
            />
          </div>
        )}
      </div>
    </>
  );
}
