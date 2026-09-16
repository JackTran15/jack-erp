import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@erp/ui";
import { flattenCategoryTree } from "../../../components/crud/itemCategoryTree";
import { useItemCategoryTree } from "../../../components/crud/useItemCategoryTree";

/** Radix Select không nhận value rỗng — sentinel cho mục "Tất cả". */
const ALL_VALUE = "__all__";

interface Props {
  /** Id nhóm đang chọn; null = Tất cả. */
  value: string | null;
  onChange: (categoryId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Dropdown "Nhóm hàng hoá" dạng cây: mục đầu "Tất cả"; nhóm cha là mục chọn
 * được (server gom cả nhóm con — A-06) hiển thị như tiêu đề, nhóm con thụt vào.
 */
export function ItemCategoryTreeSelect({
  value,
  onChange,
  disabled,
  className,
}: Props) {
  const treeQuery = useItemCategoryTree({}, true);
  const rows = useMemo(
    () => flattenCategoryTree(treeQuery.data?.data ?? []),
    [treeQuery.data],
  );

  return (
    <Select
      value={value ?? ALL_VALUE}
      onValueChange={(next) => onChange(next === ALL_VALUE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger className={cn("h-9", className)} aria-label="Nhóm hàng hóa">
        <SelectValue placeholder="Tất cả" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>Tất cả</SelectItem>
        {treeQuery.isLoading ? (
          <div className="px-3 py-1.5 text-sm text-muted-foreground">
            Đang tải…
          </div>
        ) : null}
        {rows.map((row) => (
          <SelectItem
            key={row.id}
            value={row.id}
            className={cn(row.__hasChildren && "font-semibold")}
          >
            <span
              className="block"
              style={{ paddingLeft: `${row.__depth * 1.5}rem` }}
            >
              {row.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
