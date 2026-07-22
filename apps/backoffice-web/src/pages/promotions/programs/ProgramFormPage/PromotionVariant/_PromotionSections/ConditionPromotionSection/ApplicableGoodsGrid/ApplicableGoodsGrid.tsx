import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { LineItemGrid, type LineColumn } from "@erp/ui";
import { LookupField } from "../../../../../../../../components/forms/LookupField";
import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../../../../../../../components/shared/product-select/ProductSelectDialog";
import { useTrailingEmptyRow } from "../../../../../../../../hooks/useTrailingEmptyRow";
import { apiClient } from "../../../../../../../../lib/api-axios";
import { blankApplicableGood } from "../../../../../program-form.constants";
import type { ApplicableGood } from "../../../../../program-form.types";

interface Props {
  value: ApplicableGood[];
  onChange: (goods: ApplicableGood[]) => void;
  /** Khóa thêm sản phẩm (khi điều kiện ≠ "Yêu cầu số lượng cụ thể"). */
  disabled?: boolean;
}

/** Một hàng hóa trả về từ tra cứu `/inventory/items`. */
interface ItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface ItemsResponse {
  data: ItemOption[];
  page: number;
  pageSize: number;
  total: number;
}

/** Search hàng hóa cho LookupField — mirror trang barcode (GET /inventory/items). */
async function searchItems(query: string, page: number, pageSize?: number) {
  const effectivePageSize = pageSize ?? 20;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(effectivePageSize),
  });
  if (query.trim()) params.set("search", query.trim());
  const { data } = await apiClient.get<ItemsResponse>(
    `/inventory/items?${params}`,
  );
  const fetched = data.page * data.pageSize;
  return { items: data.data, hasMore: fetched < data.total, total: data.total };
}

export function ApplicableGoodsGrid({ value, onChange, disabled }: Props) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  // Adapter: useTrailingEmptyRow cần một dispatcher, nhưng đây là state controlled.
  const setRows: Dispatch<SetStateAction<ApplicableGood[]>> = (updater) => {
    onChange(
      typeof updater === "function"
        ? (updater as (prev: ApplicableGood[]) => ApplicableGood[])(value)
        : updater,
    );
  };

  // Giữ đúng một row trống cuối; chọn hàng hóa ở row cuối -> tự thêm row mới.
  useTrailingEmptyRow(value, setRows, {
    isEmpty: (row) => !row.itemId,
    makeEmpty: blankApplicableGood,
  });

  const updateRow = (id: string, patch: Partial<ApplicableGood>) =>
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) =>
    onChange(value.filter((r) => r.id !== id));

  // Thêm hàng hóa từ dialog chọn hàng loạt (dedupe theo itemId; bỏ row trống,
  // useTrailingEmptyRow sẽ tự thêm lại row trống cuối).
  const addFromPicker = (result: ProductSelectResult) => {
    const existingIds = new Set(
      value.filter((r) => r.itemId).map((r) => r.itemId),
    );
    const newRows: ApplicableGood[] = result.lines
      .filter((line) => !existingIds.has(line.itemId))
      .map((line) => ({
        id: crypto.randomUUID(),
        itemId: line.itemId,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        minQuantity: "",
      }));
    if (newRows.length) {
      onChange([...value.filter((r) => r.itemId), ...newRows]);
    }
    setPickerOpen(false);
  };

  // Lọc client-side theo filter row; map rowIndex -> row thật qua id.
  const visibleRows = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim());
    if (!active.length) return value;
    return value.filter((row) =>
      active.every(([key, q]) => {
        const cell = row[key as keyof ApplicableGood];
        return String(cell ?? "")
          .toLowerCase()
          .includes(q.trim().toLowerCase());
      }),
    );
  }, [value, filters]);

  const columns: LineColumn<ApplicableGood>[] = [
    {
      key: "sku",
      label: "Mã SKU",
      width: "20%",
      filterSymbol: "*",
      placeholder: "Tìm mã hoặc tên hàng hóa",
      renderEditor: (row) => (
        <LookupField<ItemOption>
          value={row.sku}
          disabled={disabled}
          placeholder="Tìm mã hoặc tên hàng hóa"
          search={searchItems}
          onValueChange={(text) => updateRow(row.id, { sku: text })}
          onSelect={(item) =>
            updateRow(row.id, {
              itemId: item.id,
              sku: item.code,
              name: item.name,
              unit: item.unit,
            })
          }
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
          columns={[
            { key: "code", label: "Mã SKU", render: (i) => i.code },
            { key: "name", label: "Tên hàng hóa", render: (i) => i.name },
            { key: "unit", label: "Đơn vị", render: (i) => i.unit },
          ]}
          onSearchButtonClick={() => setPickerOpen(true)}
        />
      ),
    },
    {
      key: "name",
      label: "Tên hàng hóa",
      type: "readonly",
      width: "35%",
      filterSymbol: "*",
    },
    {
      key: "unit",
      label: "Đơn vị tính",
      type: "readonly",
      width: "13%",
      filterSymbol: "*",
    },
    {
      key: "minQuantity",
      label: "Lớn hơn hoặc bằng số lượng",
      type: "number",
      width: "22%",
      align: "right",
      filterSymbol: "≤",
    },
  ];

  return (
    <>
      <LineItemGrid<ApplicableGood>
        columns={columns}
        rows={visibleRows}
        onChangeCell={(rowIndex, key, val) => {
          const row = visibleRows[rowIndex];
          if (!row) return;
          if (key === "minQuantity") {
            updateRow(row.id, { minQuantity: val === "" ? "" : Number(val) });
          }
        }}
        onDeleteRow={(rowIndex) => {
          const row = visibleRows[rowIndex];
          if (row) removeRow(row.id);
        }}
        filters={filters}
        onFilterChange={setFilters}
        showAddRow={false}
        emptyText="Chưa có hàng hóa"
      />

      {pickerOpen ? (
        <ProductSelectDialog
          open
          onOpenChange={setPickerOpen}
          title="Chọn hàng hóa"
          initialSelectedIds={
            new Set(value.filter((r) => r.itemId).map((r) => r.itemId))
          }
          onConfirm={addFromPicker}
        />
      ) : null}
    </>
  );
}
