import { AppModal, Button, Input } from "@erp/ui";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCrudRecords } from "../../../components/crud";
import {
  BaseDataTable,
  TableColumn,
} from "../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../components/table/PaginationControls";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelectedIds?: Set<string>;
  onConfirm: (selectedIds: Set<string>) => void;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

function getText(record: Record<string, unknown>, key: string): string {
  const raw = record[key];
  if (raw === null || raw === undefined || raw === "") return "—";
  return String(raw);
}

function formatMoney(val: unknown): string {
  const n = Number(val);
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}

export function InventoryExportSelectDialog({
  open,
  onOpenChange,
  initialSelectedIds,
  onConfirm,
}: Props) {
  // ─── Search state ────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");

  // ─── Pagination ──────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // ─── Selection ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    initialSelectedIds ? new Set(initialSelectedIds) : new Set(),
  );

  useEffect(() => {
    setPage(1);
  }, [categoryId, committedSearch, pageSize]);

  // ─── API: categories ─────────────────────────────────────────────────
  const categoriesQuery = useCrudRecords(
    "inventory-item-categories",
    { page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" },
    true,
  );
  const categories = (categoriesQuery.data?.data ?? []) as Record<
    string,
    unknown
  >[];

  // ─── API: items (server-side pagination + filter) ────────────────────
  const itemsQuery = useCrudRecords(
    "inventory-items",
    {
      page,
      pageSize,
      search: committedSearch || undefined,
      filters: categoryId ? { categoryId } : undefined,
    },
    true,
  );
  const rows = (itemsQuery.data?.data ?? []) as Record<string, unknown>[];
  const total = itemsQuery.data?.total ?? 0;

  // ─── Selection helpers ────────────────────────────────────────────────
  const allPageSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(String(r.id)));
  const somePageSelected =
    !allPageSelected && rows.some((r) => selectedIds.has(String(r.id)));

  const togglePage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => {
          const id = String(r.id);
          if (checked) next.add(id);
          else next.delete(id);
        });
        return next;
      });
    },
    [rows],
  );

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function commitSearch() {
    setCommittedSearch(searchInput.trim());
  }

  // ─── Table definition ────────────────────────────────────────────────
  const columns: TableColumn<Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "code",
        label: "Mã SKU",
        width: 140,
        render: (row) => (
          <span className="font-mono text-xs">{getText(row, "code")}</span>
        ),
      },
      {
        key: "name",
        label: "Tên hàng hóa",
        render: (row) => getText(row, "name"),
      },
      {
        key: "categoryName",
        label: "Nhóm hàng hóa",
        width: 180,
        render: (row) => {
          const v = getText(row, "categoryName");
          return v !== "—" ? v : getText(row, "category");
        },
      },
      {
        key: "unit",
        label: "Đơn vị tính",
        width: 110,
        render: (row) => getText(row, "unit"),
      },
      {
        key: "sellingPrice",
        label: "Giá bán TB",
        width: 130,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatMoney(row.sellingPrice),
      },
    ],
    [],
  );

  const leadingColumn = useMemo(
    () => ({
      width: 48,
      header: (
        <input
          type="checkbox"
          aria-label="Chọn tất cả hàng hóa trên trang"
          checked={allPageSelected}
          ref={(el) => {
            if (el) el.indeterminate = somePageSelected;
          }}
          onChange={(e) => togglePage(e.target.checked)}
        />
      ),
      cell: (row: Record<string, unknown>) => {
        const id = String(row.id);
        return (
          <input
            type="checkbox"
            aria-label={`Chọn ${getText(row, "name")}`}
            checked={selectedIds.has(id)}
            onChange={(e) => toggleRow(id, e.target.checked)}
          />
        );
      },
    }),
    [allPageSelected, somePageSelected, selectedIds, togglePage],
  );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Chọn hàng hóa"
      description="Chọn các hàng hóa cần xuất khẩu."
      defaultWidth={920}
      defaultHeight={640}
      minWidth={600}
      minHeight={400}
      bodyClassName="overflow-hidden flex flex-col gap-3"
      showFooter
      footer={
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Đã chọn{" "}
            <span className="font-semibold text-foreground">
              {selectedIds.size}
            </span>{" "}
            hàng hóa.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button
              disabled={selectedIds.size === 0}
              onClick={() => {
                onOpenChange(false);
                onConfirm(selectedIds);
              }}
            >
              Xuất khẩu ({selectedIds.size})
            </Button>
          </div>
        </div>
      }
    >
      {/* Search bar */}
      <div className="flex shrink-0 items-center gap-2">
        <select
          className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Lọc theo nhóm hàng hóa"
        >
          <option value="">— Tất cả nhóm —</option>
          {categories.map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {getText(c, "name")}
            </option>
          ))}
        </select>

        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSearch();
          }}
          placeholder="Nhập mã SKU, tên hàng hóa"
          className="h-9 flex-1"
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5"
          onClick={commitSearch}
        >
          <Search className="h-4 w-4" aria-hidden />
          Tìm kiếm
        </Button>
      </div>

      {/* Table + pagination */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <BaseDataTable
          columns={columns}
          rows={rows}
          loading={itemsQuery.isLoading || itemsQuery.isFetching}
          emptyLabel="Không có hàng hóa phù hợp."
          getRowKey={(row) => String(row.id)}
          leadingColumn={leadingColumn}
          className="min-h-0 flex-1 rounded-none border-0"
          scrollContainerClassName="flex-1"
        />
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
      </div>
    </AppModal>
  );
}
