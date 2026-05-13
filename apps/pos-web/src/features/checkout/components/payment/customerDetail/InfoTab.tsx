import { InfoSectionGroup, type InfoRow } from "./InfoSectionGroup";
import { CustomerGenderEnum } from "@erp/pos/features/checkout/constants/customer";
import type { CustomerDetailData } from "./types";

export interface InfoTabProps {
  data: CustomerDetailData;
}

function genderLabel(g: CustomerDetailData["identity"]["gender"]): string {
  if (g === CustomerGenderEnum.MALE) return "Nam";
  if (g === CustomerGenderEnum.FEMALE) return "Nữ";
  return "";
}

/**
 * "Thông tin" tab — three grouped sections (cơ bản / thẻ thành viên / công ty).
 * Each group is a `InfoSectionGroup` so adding more groups later is trivial.
 */
export function InfoTab({ data }: InfoTabProps) {
  const { identity, membership, company } = data;

  const basic: InfoRow[] = [
    { label: "Mã khách hàng", value: identity.code ?? identity.id },
    { label: "Tên khách hàng", value: identity.name },
    { label: "Số điện thoại", value: identity.phone ?? undefined },
    { label: "CCCD", value: identity.cccd ?? undefined },
    { label: "Ngày sinh", value: identity.birthday ?? undefined },
    { label: "Email", value: identity.email ?? undefined },
    { label: "Giới tính", value: genderLabel(identity.gender) },
    { label: "Địa chỉ", value: identity.address ?? undefined },
  ];

  const card: InfoRow[] = [
    { label: "Mã thẻ Lomas", value: membership?.cardCode ?? undefined },
    { label: "Hạng thẻ Lomas", value: membership?.tier ?? undefined },
    { label: "Nhóm KH", value: membership?.customerGroup ?? undefined },
    {
      label: "Nhân viên phụ trách",
      value: membership?.accountManager ?? undefined,
    },
  ];

  const companyRows: InfoRow[] = [
    { label: "Công ty", value: company?.companyName ?? undefined },
    { label: "Mã số thuế", value: company?.taxCode ?? undefined },
    { label: "Ghi chú", value: company?.note ?? undefined },
  ];

  return (
    <div className="space-y-4">
      <InfoSectionGroup
        title="Thông tin cơ bản"
        rows={basic}
        emptyPlaceholder="Chưa có thông tin"
      />
      <InfoSectionGroup
        title="Thông tin thẻ thành viên"
        rows={card}
        emptyPlaceholder="Chưa có thẻ"
      />
      <InfoSectionGroup
        title="Thông tin công ty"
        rows={companyRows}
        emptyPlaceholder="Chưa có thông tin"
      />
    </div>
  );
}
