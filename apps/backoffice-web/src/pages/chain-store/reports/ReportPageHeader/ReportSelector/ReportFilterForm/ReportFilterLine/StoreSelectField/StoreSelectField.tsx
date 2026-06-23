import { useEffect } from "react";
import { useMyBranches } from "../../../../../../../../hooks/iam/useBranches";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Single-select cửa hàng cho chế độ chuỗi cửa hàng — bắt buộc chọn 1 chi nhánh
 * thật để lọc báo cáo (không có mục "tất cả"). Mặc định cửa hàng đầu tiên.
 */
export function StoreSelectField({ value, onChange }: Props) {
  const { data } = useMyBranches();
  const options = (data ?? []).map((b) => ({ value: b.id, label: b.name }));
  const firstId = data && data.length > 0 ? data[0].id : "";

  // Bắt buộc có giá trị — mặc định cửa hàng đầu tiên khi chưa chọn.
  useEffect(() => {
    if (!value && firstId) onChange(firstId);
  }, [value, firstId, onChange]);

  return (
    <ReportSelectField
      value={value}
      options={options}
      hidePlaceholder
      onChange={onChange}
    />
  );
}
