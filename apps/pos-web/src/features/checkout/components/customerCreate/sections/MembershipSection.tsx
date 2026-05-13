import { PosFormItem } from "@erp/pos/components/form/PosFormItem";
import { PosSectionBanner } from "@erp/pos/components/form/PosSectionBanner";
import { PosSelect } from "@erp/pos/components/form/PosSelect";
import { PosTextInput } from "@erp/pos/components/form/PosTextInput";
import {
  PlusCircleSolidIcon,
  ScanFrameIcon,
} from "@erp/pos/components/icons/Icon";
import type { CustomerFormValues, CustomerSelectOption } from "../types";

const FORM_ITEM_LABEL_CLASS = "w-[140px] shrink-0 text-sm text-gray-700";

export interface MembershipIds {
  cardCode: string;
  cardTier: string;
  group: string;
  manager: string;
  note: string;
}

export interface MembershipSectionProps {
  values: CustomerFormValues;
  ids: MembershipIds;
  cardTiers: CustomerSelectOption[];
  customerGroups: CustomerSelectOption[];
  accountManagers: CustomerSelectOption[];
  onChange: <K extends keyof CustomerFormValues>(
    key: K,
    value: CustomerFormValues[K],
  ) => void;
  /** Optional callback for the "+ Nhóm khách hàng" inline create button. */
  onAddCustomerGroup?: () => void;
}

/** "Thông tin thẻ thành viên" — card / tier / group / staff / note. */
export function MembershipSection({
  values,
  ids,
  cardTiers,
  customerGroups,
  accountManagers,
  onChange,
  onAddCustomerGroup,
}: MembershipSectionProps) {
  return (
    <>
      <PosSectionBanner>Thông tin thẻ thành viên</PosSectionBanner>

      <div className="grid grid-cols-1 gap-y-5 gap-x-8 md:grid-cols-2">
        <PosFormItem
          label="Mã thẻ thành viên"
          htmlFor={ids.cardCode}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosTextInput
            id={ids.cardCode}
            variant="underline"
            value={values.cardCode ?? ""}
            onChange={(v) => onChange("cardCode", v)}
            trailing={
              <button
                type="button"
                aria-label="Quét mã thẻ thành viên"
                className="rounded p-0.5 text-gray-500 hover:text-gray-700"
              >
                <ScanFrameIcon size={20} />
              </button>
            }
          />
        </PosFormItem>

        <PosFormItem
          label="Hạng thẻ"
          htmlFor={ids.cardTier}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosSelect
            id={ids.cardTier}
            variant="underline"
            value={values.cardTier ?? ""}
            onChange={(v) => onChange("cardTier", v)}
            options={cardTiers}
          />
        </PosFormItem>

        <PosFormItem
          label="Nhóm khách hàng"
          htmlFor={ids.group}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosSelect
            id={ids.group}
            variant="underline"
            value={values.customerGroup ?? ""}
            onChange={(v) => onChange("customerGroup", v)}
            options={customerGroups}
            trailing={
              onAddCustomerGroup ? (
                <button
                  type="button"
                  aria-label="Thêm nhóm khách hàng mới"
                  onClick={onAddCustomerGroup}
                  className="rounded p-0.5 text-[#22C55E] hover:scale-110"
                >
                  <PlusCircleSolidIcon size={18} />
                </button>
              ) : undefined
            }
          />
        </PosFormItem>

        <PosFormItem
          label="Nhân viên phụ trách"
          htmlFor={ids.manager}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosSelect
            id={ids.manager}
            variant="underline"
            value={values.accountManager ?? ""}
            onChange={(v) => onChange("accountManager", v)}
            options={accountManagers}
          />
        </PosFormItem>

        <PosFormItem
          label="Ghi chú"
          htmlFor={ids.note}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosTextInput
            id={ids.note}
            variant="underline"
            value={values.note ?? ""}
            onChange={(v) => onChange("note", v)}
          />
        </PosFormItem>
      </div>
    </>
  );
}
