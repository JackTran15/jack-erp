import { InfoSectionGroup, type InfoRow } from "./InfoSectionGroup";
import { CustomerGenderEnum } from "@erp/pos/lib/customerApi";
import type { CustomerDetailData } from "./types";

export interface InfoTabProps {
  data: CustomerDetailData;
}

function genderLabel(g: CustomerGenderEnum): string {
  if (g === CustomerGenderEnum.MALE) return "Nam";
  if (g === CustomerGenderEnum.FEMALE) return "Nữ";
  if (g === CustomerGenderEnum.UNSPECIFIED) return "Không xác định";
  return "";
}

/**
 * "Thông tin" tab — three grouped sections (cơ bản / thẻ thành viên / công ty).
 * Each group is a `InfoSectionGroup` so adding more groups later is trivial.
 */
export function InfoTab({ data }: InfoTabProps) {
  const basic: InfoRow[] = [
    { label: "Mã khách hàng", value: data.code ?? data.id },
    { label: "Tên khách hàng", value: data.name },
    { label: "Số điện thoại", value: data.phone ?? undefined },
    { label: "CCCD", value: data.nationalId ?? undefined },
    { label: "Ngày sinh", value: data.birthDate ?? undefined },
    { label: "Email", value: data.email ?? undefined },
    {
      label: "Giới tính",
      value: genderLabel(data.gender ?? CustomerGenderEnum.UNSPECIFIED),
    },
    { label: "Địa chỉ", value: data.address ?? undefined },
  ];

  const card: InfoRow[] = [
    { label: "Mã thẻ Lomas", value: data.cardCode ?? undefined },
    { label: "Hạng thẻ Lomas", value: data.tier ?? undefined },
    { label: "Nhóm KH", value: data.groupName ?? undefined },
    { label: "Nhân viên phụ trách", value: data.staffName ?? undefined },
  ];

  const companyRows: InfoRow[] = [
    { label: "Công ty", value: data.companyName ?? undefined },
    { label: "Mã số thuế", value: data.taxCode ?? undefined },
    { label: "Ghi chú", value: data.note ?? undefined },
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
