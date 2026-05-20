import { PosSectionBanner } from "@erp/pos/components/common/PosSectionBanner/PosSectionBanner";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import type { CustomerFormValues } from "@erp/pos/interfaces/customer-dialog.interface";

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
        <PosTextInput
          id={ids.company}
          label="Công ty"
          fieldLayout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          variant="underline"
          value={values.companyName ?? ""}
          onChange={(v) => onChange("companyName", v)}
        />

        <PosTextInput
          id={ids.taxCode}
          label="Mã số thuế"
          fieldLayout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          variant="underline"
          value={values.taxCode ?? ""}
          onChange={(v) => onChange("taxCode", v)}
        />
      </div>
    </>
  );
}
