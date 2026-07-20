import { useCallback, useState } from "react";
import { LookupField } from "../../../../../../../../components/forms/LookupField";
import {
  counterpartyKey,
  useCounterpartySearch,
  type CounterpartyOption,
} from "../../../../../../../../hooks/useCounterpartySearch";
import type { ReportLookupSelection } from "../../../../../../../../store/page-stores/report/report.interface";

interface Props {
  /** Khách hàng đã chọn (id + tên hiển thị) — null = chưa chọn. */
  value: ReportLookupSelection | null;
  onChange: (selection: ReportLookupSelection | null) => void;
}

const PAGE_SIZE = 8;

/**
 * "Khách hàng" dạng select search — không có option "Tất cả" (khách hàng bắt
 * buộc chọn 1). Search server-side qua `/v2/counterparties/search` (giới hạn
 * type "customer"), dropdown dạng bảng Mã/Tên/Điện thoại — tái dùng LookupField
 * đã dùng cho các phiếu thu chi (xem CounterpartyPickerField).
 *
 * Lưu cả `label` cùng `id` trong filter store (không chỉ id) — component này
 * remount mỗi lần dialog filter đóng/mở lại, nên nếu chỉ lưu id thì không còn
 * cách nào vẽ lại tên đã chọn mà không gọi lại API.
 */
export function CustomerSearchSelectField({ value, onChange }: Props) {
  const search = useCounterpartySearch();
  // null = hiển thị theo `value` đã chọn; string = đang gõ tìm (ghi đè tạm thời).
  const [typed, setTyped] = useState<string | null>(null);

  const runSearch = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const ps = pageSize ?? PAGE_SIZE;
      const res = await search("customer", query, page, ps);
      return { items: res.data, hasMore: page * ps < res.total, total: res.total };
    },
    [search],
  );

  return (
    <LookupField<CounterpartyOption>
      value={typed ?? value?.label ?? ""}
      onValueChange={(text) => {
        setTyped(text);
        if (!text) onChange(null);
      }}
      onSelect={(item) => {
        setTyped(null);
        onChange({ id: item.id, label: item.name });
      }}
      search={runSearch}
      itemKey={counterpartyKey}
      renderItem={(c) => c.name}
      columns={[
        { key: "code", label: "Mã khách hàng", className: "w-[110px]", render: (c) => c.code ?? "—" },
        { key: "name", label: "Tên khách hàng", render: (c) => c.name },
        { key: "phone", label: "Điện thoại", className: "w-[120px]", render: (c) => c.phone ?? "—" },
      ]}
      placeholder="Tìm khách hàng…"
      dropdownMinWidth={420}
      inputClassName="h-9 text-xs"
      hideSearchButton
    />
  );
}
