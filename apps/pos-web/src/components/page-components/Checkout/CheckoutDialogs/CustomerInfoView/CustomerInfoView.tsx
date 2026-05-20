import type { ReactNode } from "react";
import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";
import { PosSectionBanner } from "@erp/pos/components/common/PosSectionBanner/PosSectionBanner";
import { CustomerGenderEnum } from "@erp/pos/types/customer.type";
import type { CustomerDetailData } from "@erp/pos/interfaces/customer-detail.interface";

const FORM_ITEM_LABEL_CLASS = "w-[140px] shrink-0 text-sm text-gray-700";

export interface CustomerInfoViewProps {
  data: CustomerDetailData;
}

function display(v: string | null | undefined): string {
  const t = v?.trim();
  return t ? t : "";
}

function genderLabel(g: CustomerGenderEnum | null | undefined): string {
  if (g === CustomerGenderEnum.MALE) return "Nam";
  if (g === CustomerGenderEnum.FEMALE) return "Nữ";
  if (g === CustomerGenderEnum.UNSPECIFIED) return "Không xác định";
  return "";
}

/**
 * Read-only mirror of `CustomerCreateDialog`'s form: same 3 grouped sections,
 * same horizontal `PosFormItem` rows, but the value slot renders plain text
 * instead of an input. Used by the `CustomerDetailDialog` "Thông tin" tab.
 */
export function CustomerInfoView({ data }: CustomerInfoViewProps) {
  return (
    <div className="space-y-3 pb-4">
      <PosSectionBanner>Thông tin cơ bản</PosSectionBanner>

      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <Row label="Mã khách hàng" value={display(data.code)} />
        <Row label="Khách hàng" value={display(data.name)} />
        <Row label="Số điện thoại" value={display(data.phone)} />
        <Row label="Email" value={display(data.email)} />
        <Row label="CCCD" value={display(data.nationalId)} />
        <Row label="Ngày sinh" value={display(data.birthDate)} />
        <Row label="Giới tính" value={genderLabel(data.gender)} className="col-span-2" />
        <Row
          label="Địa chỉ"
          value={display(data.address)}
          className="md:col-span-2"
        />
      </div>

      <PosSectionBanner>Thông tin thẻ thành viên</PosSectionBanner>

      <div className="grid grid-cols-1 gap-y-5 gap-x-8 md:grid-cols-2">
        <Row label="Mã thẻ thành viên" value={display(data.cardCode)} />
        <Row label="Hạng thẻ" value={display(data.tier)} />
        <Row label="Nhóm khách hàng" value={display(data.groupName)} />
        <Row label="Nhân viên phụ trách" value={display(data.staffName)} />
        <Row label="Ghi chú" value={display(data.note)} />
      </div>

      <PosSectionBanner>Thông tin công ty</PosSectionBanner>

      <div className="grid grid-cols-1 gap-y-5 gap-x-8 pb-6 md:grid-cols-2">
        <Row label="Công ty" value={display(data.companyName)} />
        <Row label="Mã số thuế" value={display(data.taxCode)} />
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

function Row({ label, value, className }: RowProps) {
  return (
    <PosFormItem
      label={label}
      layout="horizontal"
      labelClassName={FORM_ITEM_LABEL_CLASS}
      className={className}
    >
      <div className="flex min-h-9 items-center text-sm text-gray-900  font-bold">
        {value}
      </div>
    </PosFormItem>
  );
}
