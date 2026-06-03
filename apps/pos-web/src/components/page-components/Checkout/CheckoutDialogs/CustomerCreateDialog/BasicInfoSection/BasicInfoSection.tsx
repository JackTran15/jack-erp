import type { Ref } from "react";
import { PosRadio } from "@erp/pos/components/common/PosRadio/PosRadio";
import { PosSectionBanner } from "@erp/pos/components/common/PosSectionBanner/PosSectionBanner";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import { posFormItemLabelTopPad } from "@erp/pos/components/common/posFormDimensions";
import { CalendarIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { CustomerGenderEnum } from "@erp/pos/types/customer.type";
import { GENDER_OPTIONS } from "@erp/pos/lib/page-libs/checkout/customerFormUtils";
import type { CustomerFormValues, CustomerSelectOption } from "@erp/pos/interfaces/customer-dialog.interface";

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
  showPhoneError: boolean;
  codeError?: string;
  nameError?: string;
  phoneError?: string;
  onTouchName: () => void;
  onTouchPhone: () => void;
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
  showPhoneError,
  codeError,
  nameError,
  phoneError,
  onTouchName,
  onTouchPhone,
  nameInputRef,
}: BasicInfoSectionProps) {
  return (
    <>
      <PosSectionBanner>Thông tin cơ bản</PosSectionBanner>

      <div className="grid grid-cols-1 gap-y-5 gap-x-8 md:grid-cols-2">
        <PosTextInput
          id={ids.code}
          label="Mã khách hàng"
          required
          fieldLayout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          error={showCodeError ? codeError : undefined}
          value={values.code ?? ""}
          onChange={(v) => onChange("code", v)}
          variant="underline"
          invalid={showCodeError}
          readOnly
        />

        <PosTextInput
          inputRef={nameInputRef}
          id={ids.name}
          label="Khách hàng"
          required
          fieldLayout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          error={showNameError ? nameError : undefined}
          value={values.name}
          onChange={(v) => onChange("name", v)}
          onBlur={onTouchName}
          variant="underline"
          placeholder="Tên khách hàng"
          invalid={showNameError}
          autoComplete="name"
        />

        <PosTextInput
          id={ids.phone}
          label="Số điện thoại"
          required
          fieldLayout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          variant="underline"
          value={values.phone ?? ""}
          onChange={(v) => onChange("phone", v)}
          onBlur={onTouchPhone}
          error={showPhoneError ? phoneError : undefined}
          invalid={showPhoneError}
          placeholder="Số điện thoại"
        />

        <PosTextInput
          id={ids.email}
          label="Email"
          fieldLayout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          type="email"
          autoComplete="email"
          variant="underline"
          value={values.email ?? ""}
          onChange={(v) => onChange("email", v)}
        />

        <PosTextInput
          id={ids.cccd}
          label="CCCD"
          fieldLayout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          variant="underline"
          value={values.cccd ?? ""}
          onChange={(v) => onChange("cccd", v)}
          placeholder="Số căn cước công dân"
        />

        <PosTextInput
          id={ids.birthday}
          label="Ngày sinh"
          fieldLayout="horizontal"
          labelClassName={FORM_ITEM_LABEL_CLASS}
          type="date"
          variant="underline"
          value={values.birthday ?? ""}
          onChange={(v) => onChange("birthday", v)}
          trailing={<CalendarIcon size={18} className="text-gray-500" />}
        />

        <div className="col-span-2 flex min-w-0 items-center gap-2 text-sm">
          <label className={FORM_ITEM_LABEL_CLASS}>Giới tính</label>
          <div className="min-w-0 flex-1">
            <div
              role="radiogroup"
              aria-label="Giới tính"
              className="flex h-7 items-center gap-6"
            >
              {GENDER_OPTIONS.map((opt) => (
                <PosRadio
                  key={opt.value}
                  name="gender"
                  value={opt.value}
                  label={opt.label}
                  selected={
                    (values.gender ?? CustomerGenderEnum.UNSPECIFIED) ===
                    opt.value
                  }
                  onChange={() => onChange("gender", opt.value)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-2 text-sm md:col-span-2">
          <label
            className={`${FORM_ITEM_LABEL_CLASS} ${posFormItemLabelTopPad.md}`}
          >
            Địa chỉ
          </label>
          <div className="min-w-0 flex-1">
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <PosSelect
                  value={
                    provinces.find((o) => o.value === values.province) ?? null
                  }
                  onChange={(item) => onChange("province", item.value)}
                  items={provinces}
                  itemKey={(o) => o.value}
                  renderItem={(o) => o.label}
                  variant="underline"
                  placeholder="Tỉnh/Thành phố"
                  ariaLabel="Tỉnh/Thành phố"
                />
                <PosSelect
                  value={
                    districts.find((o) => o.value === values.district) ?? null
                  }
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
          </div>
        </div>
      </div>
    </>
  );
}
