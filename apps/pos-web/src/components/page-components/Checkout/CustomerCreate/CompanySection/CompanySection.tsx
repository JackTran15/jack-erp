import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";
import { PosSectionBanner } from "@erp/pos/components/common/PosSectionBanner/PosSectionBanner";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import type { CustomerFormValues } from "@erp/pos/lib/checkout/customerCreate.types";

const FORM_ITEM_LABEL_CLASS = "w-[140px] shrink-0 text-sm text-gray-700";

export interface CompanyIds {
  company: string;
  taxCode: string;
}

export interface CompanySectionProps {
  values: CustomerFormValues;
  ids: CompanyIds;
  onChange: <K extends keyof CustomerFormValues>(
    key: K,
    value: CustomerFormValues[K],
  ) => void;
}

/** "Thông tin công ty" — B2B fields (company name + tax code). */
export function CompanySection({ values, ids, onChange }: CompanySectionProps) {
  return (
    <>
      <PosSectionBanner>Thông tin công ty</PosSectionBanner>

      <div className="grid grid-cols-1 gap-y-5 gap-x-8 pb-6 md:grid-cols-2">
        <PosFormItem
          label="Công ty"
          htmlFor={ids.company}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosTextInput
            id={ids.company}
            variant="underline"
            value={values.companyName ?? ""}
            onChange={(v) => onChange("companyName", v)}
          />
        </PosFormItem>

        <PosFormItem
          label="Mã số thuế"
          htmlFor={ids.taxCode}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosTextInput
            id={ids.taxCode}
            variant="underline"
            value={values.taxCode ?? ""}
            onChange={(v) => onChange("taxCode", v)}
          />
        </PosFormItem>
      </div>
    </>
  );
}
