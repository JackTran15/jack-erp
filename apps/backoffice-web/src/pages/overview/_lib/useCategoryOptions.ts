/**
 * Options cho dropdown "Nhóm hàng hóa" của modal row 3.
 *
 * Dùng dữ liệu THẬT: `useItemCategoryTree` (`POST /v2/inventory/item-categories/tree`)
 * cộng `flattenCategoryTree` — cả hai đã có sẵn trong `components/crud/`.
 */
import { useMemo } from "react";
import { flattenCategoryTree } from "../../../components/crud/itemCategoryTree";
import { useItemCategoryTree } from "../../../components/crud/useItemCategoryTree";
import { ALL_VALUE } from "../../../store/page-stores/overview/overview.interface";

/** Thụt lề nhóm con bằng tiền tố, giống `TreeSelectInput` đang làm. */
function indentPrefix(depth: number): string {
  return depth === 0 ? "" : `${"　".repeat(depth)}— `;
}

export interface CategoryOptions {
  options: { value: string; label: string }[];
  /** Nhãn của các nhóm gốc — dùng làm lát pie khi thống kê theo nhóm hàng hóa. */
  rootLabels: string[];
  /** Nhãn của nhóm đang chọn, hoặc "Tất cả". */
  labelOf: (value: string) => string;
  isLoading: boolean;
}

/**
 * @param parentsOnly `true` khi "Thống kê theo" = Nhóm hàng hóa — chỉ nhóm cha.
 *   Ngược lại trả cả cha lẫn con, con được thụt lề.
 */
export function useCategoryOptions(
  parentsOnly: boolean,
  enabled = true,
): CategoryOptions {
  const { data, isLoading } = useItemCategoryTree({}, enabled);

  return useMemo(() => {
    const flat = flattenCategoryTree(data?.data ?? []);
    const visible = parentsOnly ? flat.filter((row) => row.__depth === 0) : flat;

    const options = [
      { value: ALL_VALUE, label: "Tất cả" },
      ...visible.map((row) => ({
        value: row.id,
        label: `${indentPrefix(row.__depth)}${row.name}`,
      })),
    ];

    const labelOf = (value: string) =>
      value === ALL_VALUE
        ? "Tất cả"
        : (flat.find((row) => row.id === value)?.name ?? "Tất cả");

    return {
      options,
      rootLabels: flat.filter((row) => row.__depth === 0).map((row) => row.name),
      labelOf,
      isLoading,
    };
  }, [data, parentsOnly, isLoading]);
}
