import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatClientError } from "@erp/api-client";
import { Plus } from "lucide-react";
import { AppModal, Badge, type ToolbarItem } from "@erp/ui";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { TableActionHeader } from "../../components/layout/TableActionHeader";
import { resolveBackofficeBreadcrumbs } from "../../components/layout/breadcrumbs";
import {
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  productsApi,
  type PaginatedResponse,
  type Product,
} from "../../api/products";
import { ProductForm } from "./components/ProductForm";

export function ProductsPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<PaginatedResponse<Product> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await productsApi.list({
        page: pagination.page,
        pageSize: pagination.pageSize,
        search: search.trim() || undefined,
      });
      setRecords(data);
      setError(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const columns: TableColumn<Product>[] = [
    {
      key: "name",
      label: "Tên sản phẩm",
      render: (row) => (
        <span className="font-medium">{row.name}</span>
      ),
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
      key: "isActive",
      label: "Trạng thái",
      render: (row) => (
        <Badge variant={row.isActive ? "default" : "secondary"}>
          {row.isActive ? "Hoạt động" : "Ngừng"}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      label: "Ngày tạo",
      render: (row) => new Date(row.createdAt).toLocaleDateString("vi-VN"),
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

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
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

      <div className="mb-4">
        <input
          type="search"
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Tìm kiếm sản phẩm..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
        />
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <BaseDataTable
        columns={columns}
        rows={records?.data ?? []}
        loading={loading}
        emptyLabel="Chưa có sản phẩm nào."
        getRowKey={(row) => row.id}
        renderActions={(row) => (
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline"
            onClick={() => navigate(`/products/${row.id}`)}
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
    </div>
  );
}
