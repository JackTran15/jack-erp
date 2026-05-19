import { FormField, FormFieldProps, Input, cn } from "@erp/ui";
import type { AddressBlock, EmployeeFormDraft } from "../employee.types";

interface EmployeeContactFormTabProps {
  draft: EmployeeFormDraft;
  onChange: (draft: EmployeeFormDraft) => void;
}

const FORM_LABEL_WIDTH = "8.75rem";

function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h4
      className={cn(
        "mt-4 flex items-center gap-2 text-base font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </h4>
  );
}

function AddressFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AddressBlock;
  onChange: (next: AddressBlock) => void;
}) {
  const fieldProps: Partial<FormFieldProps> = {
    layout: "horizontal",
    labelWidth: FORM_LABEL_WIDTH,
  };

  return (
    <div className="mt-2 space-y-2">
      <FormField label={`${label} — Địa chỉ`} {...fieldProps}>
        <Input
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Quốc gia" {...fieldProps}>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={value.country}
            onChange={(e) => onChange({ ...value, country: e.target.value })}
          >
            <option value="Việt Nam">Việt Nam</option>
          </select>
        </FormField>
        <FormField label="Tỉnh/TP" {...fieldProps}>
          <Input
            placeholder="Nhập để tìm kiếm"
            value={value.province}
            onChange={(e) => onChange({ ...value, province: e.target.value })}
          />
        </FormField>
        <FormField label="Quận/Huyện" {...fieldProps}>
          <Input
            placeholder="Nhập để tìm kiếm"
            value={value.district}
            onChange={(e) => onChange({ ...value, district: e.target.value })}
          />
        </FormField>
        <FormField label="Xã/Phường" {...fieldProps}>
          <Input
            placeholder="Nhập để tìm kiếm"
            value={value.ward}
            onChange={(e) => onChange({ ...value, ward: e.target.value })}
          />
        </FormField>
      </div>
    </div>
  );
}

export function EmployeeContactFormTab({
  draft,
  onChange,
}: EmployeeContactFormTabProps) {
  const setContact = (patch: Partial<EmployeeFormDraft["contact"]>) => {
    onChange({ ...draft, contact: { ...draft.contact, ...patch } });
  };

  const fieldProps: Partial<FormFieldProps> = {
    layout: "horizontal",
    labelWidth: FORM_LABEL_WIDTH,
  };

  const copyPermanentToCurrent = () => {
    onChange({
      ...draft,
      contact: {
        ...draft.contact,
        currentAddress: { ...draft.contact.permanentAddress },
      },
    });
  };

  return (
    <div className="space-y-2 p-4">
      <FormField label="ĐT nhà riêng" {...fieldProps}>
        <Input
          value={draft.contact.homePhone}
          onChange={(e) => setContact({ homePhone: e.target.value })}
        />
      </FormField>

      <SectionHeading>Hộ khẩu thường trú</SectionHeading>
      <AddressFields
        label="Hộ khẩu"
        value={draft.contact.permanentAddress}
        onChange={(permanentAddress) => setContact({ permanentAddress })}
      />

      <SectionHeading>
        Chỗ ở hiện tại
        <button
          type="button"
          className="text-xs text-indigo-500 hover:underline hover:text-indigo-600 font-normal"
          onClick={copyPermanentToCurrent}
        >
          (Sao chép từ thông tin hộ khẩu thường trú)
        </button>
      </SectionHeading>

      <AddressFields
        label="Hiện tại"
        value={draft.contact.currentAddress}
        onChange={(currentAddress) => setContact({ currentAddress })}
      />

      <SectionHeading>Liên hệ khẩn cấp</SectionHeading>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        <FormField label="Họ và tên" {...fieldProps}>
          <Input
            value={draft.contact.emergency.fullName}
            onChange={(e) =>
              setContact({
                emergency: {
                  ...draft.contact.emergency,
                  fullName: e.target.value,
                },
              })
            }
          />
        </FormField>
        <FormField label="Quan hệ" {...fieldProps}>
          <Input
            value={draft.contact.emergency.relationship}
            onChange={(e) =>
              setContact({
                emergency: {
                  ...draft.contact.emergency,
                  relationship: e.target.value,
                },
              })
            }
          />
        </FormField>
        <FormField label="ĐT di động" {...fieldProps}>
          <Input
            value={draft.contact.emergency.mobile}
            onChange={(e) =>
              setContact({
                emergency: {
                  ...draft.contact.emergency,
                  mobile: e.target.value,
                },
              })
            }
          />
        </FormField>
        <FormField label="ĐT nhà riêng" {...fieldProps}>
          <Input
            value={draft.contact.emergency.homePhone}
            onChange={(e) =>
              setContact({
                emergency: {
                  ...draft.contact.emergency,
                  homePhone: e.target.value,
                },
              })
            }
          />
        </FormField>
        <FormField label="Email" {...fieldProps}>
          <Input
            type="email"
            value={draft.contact.emergency.email}
            onChange={(e) =>
              setContact({
                emergency: {
                  ...draft.contact.emergency,
                  email: e.target.value,
                },
              })
            }
          />
        </FormField>
        <FormField label="Địa chỉ" {...fieldProps} className="col-span-2">
          <Input
            value={draft.contact.emergency.address}
            onChange={(e) =>
              setContact({
                emergency: {
                  ...draft.contact.emergency,
                  address: e.target.value,
                },
              })
            }
          />
        </FormField>
      </div>
    </div>
  );
}
