import { useCallback, useState } from "react";
import { LookupField } from "../../../../../../../../components/forms/LookupField";
import {
  counterpartyKey,
  useCounterpartySearch,
  type CounterpartyOption,
} from "../../../../../../../../hooks/useCounterpartySearch";
import type { ReportLookupSelection } from "../../../../../../../../store/page-stores/report/report.interface";

interface Props {
  /** Nhà cung cấp đã chọn (id + tên hiển thị) — null = chưa chọn. */
  value: ReportLookupSelection | null;
  onChange: (selection: ReportLookupSelection | null) => void;
}

const PAGE_SIZE = 8;

/**
 * "Nhà cung cấp" dạng select search — không có option "Tất cả" (nhà cung cấp
 * bắt buộc chọn 1). Search server-side qua `/v2/counterparties/search` (giới
 * hạn type "supplier") — cùng cơ chế với CustomerSearchSelectField, kể cả việc
 * lưu cả `label` cùng `id` để không mất tên hiển thị khi dialog filter remount.
 */
export function SupplierSearchSelectField({ value, onChange }: Props) {
  const search = useCounterpartySearch();
  const [typed, setTyped] = useState<string | null>(null);

  const runSearch = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const ps = pageSize ?? PAGE_SIZE;
      const res = await search("supplier", query, page, ps);
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
        { key: "name", label: "Tên nhà cung cấp", render: (c) => c.name },
        { key: "code", label: "Mã nhà cung cấp", className: "w-[130px]", render: (c) => c.code ?? "—" },
        { key: "phone", label: "Điện thoại", className: "w-[120px]", render: (c) => c.phone ?? "—" },
      ]}
      placeholder="Tìm nhà cung cấp…"
      dropdownMinWidth={420}
      inputClassName="h-9 text-xs"
      hideSearchButton
    />
  );
}
