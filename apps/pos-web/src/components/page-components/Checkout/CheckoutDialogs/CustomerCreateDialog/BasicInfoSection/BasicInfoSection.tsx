import type { Ref } from "react";
import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";
import { PosRadioGroup } from "@erp/pos/components/common/PosRadioGroup/PosRadioGroup";
import { PosSectionBanner } from "@erp/pos/components/common/PosSectionBanner/PosSectionBanner";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import { CalendarIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { CustomerGenderEnum } from "@erp/pos/lib/common/customerApi";
import { GENDER_OPTIONS } from "@erp/pos/lib/page-libs/checkout/customerFormUtils";
import type { CustomerFormValues, CustomerSelectOption } from "@erp/pos/lib/page-libs/checkout/customerCreate.types";

const FORM_ITEM_LABEL_CLASS = "w-[140px] shrink-0 text-sm text-gray-700";

export interface BasicInfoIds {
  code: string;
  name: string;
  phone: string;
  email: string;
  cccd: string;
  birthday: string;
}

export interface BasicInfoSectionProps {
  values: CustomerFormValues;
  ids: BasicInfoIds;
  provinces: CustomerSelectOption[];
  districts: CustomerSelectOption[];
  wards: CustomerSelectOption[];
  onChange: <K extends keyof CustomerFormValues>(
    key: K,
    value: CustomerFormValues[K],
  ) => void;
  /** Touched-error flags resolved by the parent. */
  showCodeError: boolean;
  showNameError: boolean;
  codeError?: string;
  nameError?: string;
  onTouchName: () => void;
  /** Forwarded to the "Khách hàng" input — caller uses it to auto-focus on dialog open. */
  nameInputRef?: Ref<HTMLInputElement>;
}

/** "Thông tin cơ bản" — identity / contact / address grid. */
export function BasicInfoSection({
  values,
  ids,
  provinces,
  districts,
  wards,
  onChange,
  showCodeError,
  showNameError,
  codeError,
  nameError,
  onTouchName,
  nameInputRef,
}: BasicInfoSectionProps) {
  return (
    <>
      <PosSectionBanner>Thông tin cơ bản</PosSectionBanner>

      <div className="grid grid-cols-1 gap-y-5 gap-x-8 md:grid-cols-2">
        <PosFormItem
          label="Mã khách hàng"
          htmlFor={ids.code}
          required
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          error={showCodeError ? codeError : undefined}
        >
          <PosTextInput
            id={ids.code}
            value={values.code ?? ""}
            onChange={(v) => onChange("code", v)}
            variant="underline"
            invalid={showCodeError}
            readOnly          />
        </PosFormItem>

        <PosFormItem
          label="Khách hàng"
          htmlFor={ids.name}
          required
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          error={showNameError ? nameError : undefined}
        >
          <PosTextInput
            inputRef={nameInputRef}
            id={ids.name}
            value={values.name}
            onChange={(v) => onChange("name", v)}
            onBlur={onTouchName}
            variant="underline"
            placeholder="Tên khách hàng"
            invalid={showNameError}
            autoComplete="name"          />
        </PosFormItem>

        <PosFormItem
          label="Số điện thoại"
          htmlFor={ids.phone}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosTextInput
            id={ids.phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            variant="underline"
            value={values.phone ?? ""}
            onChange={(v) => onChange("phone", v)}
            placeholder="Số điện thoại"          />
        </PosFormItem>

        <PosFormItem
          label="Email"
          htmlFor={ids.email}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosTextInput
            id={ids.email}
            type="email"
            autoComplete="email"
            variant="underline"
            value={values.email ?? ""}
            onChange={(v) => onChange("email", v)}          />
        </PosFormItem>

        <PosFormItem
          label="CCCD"
          htmlFor={ids.cccd}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosTextInput
            id={ids.cccd}
            variant="underline"
            value={values.cccd ?? ""}
            onChange={(v) => onChange("cccd", v)}
            placeholder="Số căn cước công dân"          />
        </PosFormItem>

        <PosFormItem
          label="Ngày sinh"
          htmlFor={ids.birthday}
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <PosTextInput
            id={ids.birthday}
            type="date"
            variant="underline"
            value={values.birthday ?? ""}
            onChange={(v) => onChange("birthday", v)}
            trailing={<CalendarIcon size={18} className="text-gray-500" />}          />
        </PosFormItem>

        <PosFormItem
          label="Giới tính"
          layout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          className="col-span-2"
        >
          <PosRadioGroup<CustomerGenderEnum>
            name="gender"
            value={values.gender ?? CustomerGenderEnum.UNSPECIFIED}
            onChange={(v) => onChange("gender", v)}
            options={GENDER_OPTIONS}          />
        </PosFormItem>

        <PosFormItem
          label="Địa chỉ"
          layout="horizontal"
          alignTop
          className="md:col-span-2"
          labelClassName={FORM_ITEM_LABEL_CLASS}
        >
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <PosSelect
                value={provinces.find((o) => o.value === values.province) ?? null}
                onChange={(item) => onChange("province", item.value)}
                items={provinces}
                itemKey={(o) => o.value}
                renderItem={(o) => o.label}
                variant="underline"
                placeholder="Tỉnh/Thành phố"
                ariaLabel="Tỉnh/Thành phố"
              />
              <PosSelect
                value={districts.find((o) => o.value === values.district) ?? null}
                onChange={(item) => onChange("district", item.value)}
                items={districts}
                itemKey={(o) => o.value}
                renderItem={(o) => o.label}
                variant="underline"
                placeholder="Quận/huyện"
                ariaLabel="Quận/huyện"
              />
              <PosSelect
                value={wards.find((o) => o.value === values.ward) ?? null}
                onChange={(item) => onChange("ward", item.value)}
                items={wards}
                itemKey={(o) => o.value}
                renderItem={(o) => o.label}
                variant="underline"
                placeholder="Xã/phường"
                ariaLabel="Xã/phường"
              />
            </div>
            <PosTextInput
              variant="underline"
              value={values.addressLine ?? ""}
              onChange={(v) => onChange("addressLine", v)}
              placeholder="Số nhà, tên đường"
              ariaLabel="Số nhà, tên đường"
            />
          </div>
        </PosFormItem>
      </div>
    </>
  );
}
