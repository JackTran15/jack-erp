import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { AppModal, Badge, formatMoneyInteger, type ToolbarItem } from "@erp/ui";
import { toast } from "sonner";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { TableActionHeader } from "../../components/layout/TableActionHeader";
import { resolveBackofficeBreadcrumbs } from "../../components/layout/breadcrumbs";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { ProductForm } from "./components/ProductForm";

/** A variant-grouped product row from `POST /v2/products/search`. */
interface ProductRow {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  sellingPrice: number;
  variantCount: number;
  isActive: boolean;
  createdAt: string;
}

interface V2Response {
  data: ProductRow[];
  total: number;
  page: number;
  limit: number;
}

/** Filter keys align 1:1 with the `ProductSearchV2Dto` body fields. */
const FILTER_KEYS = [
  "code",
  "name",
  "description",
  "brand",
  "sellingPrice",
  "variantCount",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

/** FE filter mode → backend `StringOperator` symbol. */
const MODE_TO_STRING_OP: Record<ColumnFilterMode, "*" | "=" | "+" | "-" | "!"> = {
  contains: "*",
  equals: "=",
  startsWith: "+",
  endsWith: "-",
  notContains: "!",
};

const STRING_KEYS: FilterKey[] = ["code", "name", "description", "brand"];
const COMPARE_KEYS: FilterKey[] = ["sellingPrice", "variantCount"];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce((acc, k) => {
    acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
    return acc;
  }, {} as Record<FilterKey, ColumnFilter>);
}

/** Builds the v2 search body, emitting only non-empty declared filters. */
function buildBody(
  filters: Record<FilterKey, ColumnFilter>,
  page: number,
  limit: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = { page, limit };
  for (const key of STRING_KEYS) {
    const value = filters[key].value?.trim();
    if (value)
      body[key] = { operator: MODE_TO_STRING_OP[filters[key].mode] ?? "*", value };
  }
  for (const key of COMPARE_KEYS) {
    const value = filters[key].value?.trim();
    // The number-range filter cell is a fixed "≤ value" input.
    if (value) body[key] = { operator: "<=", value };
  }
  return body;
}

export function ProductsPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<V2Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] =
    useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [showCreate, setShowCreate] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const body = buildBody(columnFilters, pagination.page, pagination.pageSize);
      const { data } = await apiClient.post<V2Response>(
        "/v2/products/search",
        body,
      );
      setRecords(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, limit: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [columnFilters, pagination.page, pagination.pageSize]);

  useEffect(() => {
    // Debounce so rapid filter typing settles into a single request.
    const t = setTimeout(() => void loadRecords(), 300);
    return () => clearTimeout(t);
  }, [loadRecords]);

  const columns: TableColumn<ProductRow>[] = [
    {
      key: "code",
      label: "Mã sản phẩm",
      width: 140,
      render: (row) => (
        <span className="font-mono text-xs">{row.code || "—"}</span>
      ),
    },
    {
      key: "name",
      label: "Tên sản phẩm",
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "description",
      label: "Mô tả",
      render: (row) => (
        <span className="text-muted-foreground line-clamp-1">
          {row.description || "—"}
        </span>
      ),
    },
    {
      key: "brand",
      label: "Thương hiệu",
      width: 160,
      render: (row) => row.brand || "—",
    },
    {
      key: "variantCount",
      label: "Số biến thể",
      width: 120,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => row.variantCount,
    },
    {
      key: "sellingPrice",
      label: "Giá bán TB",
      width: 140,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => formatMoneyInteger(row.sellingPrice),
    },
    {
      key: "isActive",
      label: "Trạng thái",
      width: 120,
      render: (row) => (
        <Badge variant={row.isActive ? "default" : "secondary"}>
          {row.isActive ? "Hoạt động" : "Ngừng"}
        </Badge>
      ),
    },
  ];

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Tạo sản phẩm",
      icon: Plus,
      onClick: () => setShowCreate(true),
    },
  ];

  // Any filter edit resets to page 1 so the server result starts from the top.
  const resetPage = useCallback(
    () =>
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 })),
    [],
  );

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], mode },
        }));
        resetPage();
      },
      onValueChange: (key: string, value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], value },
        }));
        resetPage();
      },
      onRangeChange: (key: string, part: "from" | "to", value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], [part]: value },
        }));
        resetPage();
      },
    }),
    [columnFilters, resetPage],
  );

  return (
    <AdminPageShell>
      <div className="mb-3">
        <h1 className="text-2xl font-semibold">Sản phẩm</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý sản phẩm, thuộc tính và biến thể.
        </p>
      </div>

      <TableActionHeader
        className="mb-4"
        breadcrumbs={resolveBackofficeBreadcrumbs("/products")}
        items={toolbarItems}
      />

      <BaseDataTable
        columns={columns}
        rows={records?.data ?? []}
        loading={loading}
        emptyLabel="Chưa có sản phẩm nào."
        getRowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/products/${row.id}`)}
        columnFilterControl={columnFilterControl}
        renderActions={(row) => (
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/products/${row.id}`);
            }}
          >
            Chi tiết
          </button>
        )}
      />

      <PaginationControls
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={records?.total ?? 0}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
        onPageSizeChange={(nextPageSize) =>
          setPagination((prev) => ({ ...prev, page: 1, pageSize: nextPageSize }))
        }
      />

      {showCreate && (
        <AppModal
          open
          onOpenChange={(open) => {
            if (!open) setShowCreate(false);
          }}
          title="Tạo sản phẩm"
          showFooter={false}
          className="max-w-[520px]"
        >
          <ProductForm
            onSaved={(product) => {
              setShowCreate(false);
              navigate(`/products/${product.id}`);
            }}
            onCancel={() => setShowCreate(false)}
          />
        </AppModal>
      )}
    </AdminPageShell>
  );
}
