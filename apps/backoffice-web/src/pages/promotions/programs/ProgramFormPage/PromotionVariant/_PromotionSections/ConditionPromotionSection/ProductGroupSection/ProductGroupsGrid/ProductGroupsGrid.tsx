import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { LineItemGrid, type LineColumn } from "@erp/ui";
import { LookupField } from "../../../../../../../../../components/forms/LookupField";
import { useTrailingEmptyRow } from "../../../../../../../../../hooks/useTrailingEmptyRow";
import { apiClient } from "../../../../../../../../../lib/api-axios";
import { blankApplicableGroup } from "../../../../../../program-form.constants";
import type { ApplicableGroup } from "../../../../../../program-form.types";

interface Props {
  value: ApplicableGroup[];
  onChange: (groups: ApplicableGroup[]) => void;
}

/** Một nhóm/danh mục trả về từ tra cứu entity `inventory-item-categories`. */
interface GroupOption {
  id: string;
  code?: string;
  name: string;
}

interface GroupsResponse {
  data: GroupOption[];
  total: number;
}

/** Search nhóm hàng hóa cho LookupField — dùng chung endpoint records của TreeSelectInput. */
async function searchGroups(query: string, page: number, pageSize?: number) {
  const effectivePageSize = pageSize ?? 20;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(effectivePageSize),
  });
  if (query.trim()) params.set("search", query.trim());
  const { data } = await apiClient.get<GroupsResponse>(
    `/admin/entities/inventory-item-categories/records?${params}`,
  );
  return {
    items: data.data,
    hasMore: page * effectivePageSize < data.total,
    total: data.total,
  };
}

export function ProductGroupsGrid({ value, onChange }: Props) {
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Adapter: useTrailingEmptyRow cần dispatcher, nhưng đây là state controlled.
  const setRows: Dispatch<SetStateAction<ApplicableGroup[]>> = (updater) => {
    onChange(
      typeof updater === "function"
        ? (updater as (prev: ApplicableGroup[]) => ApplicableGroup[])(value)
        : updater,
    );
  };

  useTrailingEmptyRow(value, setRows, {
    isEmpty: (row) => !row.groupId,
    makeEmpty: blankApplicableGroup,
  });

  const updateRow = (id: string, patch: Partial<ApplicableGroup>) =>
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) =>
    onChange(value.filter((r) => r.id !== id));

  const visibleRows = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim());
    if (!active.length) return value;
    return value.filter((row) =>
      active.every(([key, q]) => {
        const cell = row[key as keyof ApplicableGroup];
        return String(cell ?? "")
          .toLowerCase()
          .includes(q.trim().toLowerCase());
      }),
    );
  }, [value, filters]);

  const columns: LineColumn<ApplicableGroup>[] = [
    {
      key: "code",
      label: "Mã nhóm hàng hóa",
      width: "32%",
      filterSymbol: "*",
      placeholder: "Tìm mã hoặc tên nhóm hàng hóa",
      renderEditor: (row) => (
        <LookupField<GroupOption>
          value={row.code}
          placeholder="Tìm mã hoặc tên nhóm hàng hóa"
          search={searchGroups}
          onValueChange={(text) => updateRow(row.id, { code: text })}
          onSelect={(group) =>
            updateRow(row.id, {
              groupId: group.id,
              code: group.code ?? "",
              name: group.name,
            })
          }
          itemKey={(group) => group.id}
          renderItem={(group) => group.name}
          columns={[
            { key: "code", label: "Mã nhóm HH", render: (g) => g.code ?? "" },
            { key: "name", label: "Tên nhóm hàng hóa", render: (g) => g.name },
          ]}
        />
      ),
    },
    {
      key: "name",
      label: "Tên nhóm hàng hóa",
      type: "readonly",
      width: "64%",
      filterSymbol: "*",
    },
  ];

  return (
    <LineItemGrid<ApplicableGroup>
      columns={columns}
      rows={visibleRows}
      onDeleteRow={(rowIndex) => {
        const row = visibleRows[rowIndex];
        if (row) removeRow(row.id);
      }}
      filters={filters}
      onFilterChange={setFilters}
      showAddRow={false}
      emptyText="Chưa có nhóm hàng hóa"
    />
  );
}
