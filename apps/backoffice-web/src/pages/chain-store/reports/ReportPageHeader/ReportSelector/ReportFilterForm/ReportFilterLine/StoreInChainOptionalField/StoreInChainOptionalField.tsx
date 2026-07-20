import { useMyBranches } from "../../../../../../../../hooks/iam/useBranches";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Single-select cửa hàng phụ ở chế độ Chuỗi cửa hàng — không bắt buộc, rỗng =
 * "Chuỗi cửa hàng" (gộp toàn chuỗi); chọn 1 cửa hàng để thu hẹp báo cáo về
 * riêng chi nhánh đó (xem docs/24-debt-reports-spec.md #3/#4).
 */
export function StoreInChainOptionalField({ value, onChange }: Props) {
  const { data } = useMyBranches();
  const options = (data ?? []).map((b) => ({ value: b.id, label: b.name }));

  return (
    <ReportSelectField
      value={value}
      options={options}
      placeholder="Chuỗi cửa hàng"
      onChange={onChange}
    />
  );
}
