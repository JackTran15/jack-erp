import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import { Eye, PackagePlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  TransferOrderStatus,
  type ImportableTransferOrderListItem,
} from "@erp/shared-interfaces";
import {
  InventoryPageTitle,
  InventoryTabBar,
} from "../../components/document/inventoryTabs";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../components/table/pagination.dto";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { GoodsReceiptFormDialog } from "../../components/document/GoodsReceiptFormDialog";
import type {
  InventoryProvider,
  InventoryStorage,
  PaginatedResponse,
} from "../../components/document/goods-receipt-shared";
import { GoodsIssueFormDialog } from "../../components/document/GoodsIssueFormDialog";
import type { GoodsIssue } from "../../components/document/goods-issue-shared";

const moneyFmt = new Intl.NumberFormat("vi-VN");
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

function isReceivableTransfer(row: ImportableTransferOrderListItem): boolean {
  return (
    !row.importGoodsReceiptId &&
    (row.status === TransferOrderStatus.IN_PROGRESS ||
      row.status === TransferOrderStatus.COMPLETED)
  );
}

function receiveStatusLabel(row: ImportableTransferOrderListItem): string {
  return row.importGoodsReceiptId ? "Đã nhập kho" : "Chưa nhập kho";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("vi-VN");
}

function matchesText(
  value: string,
  filterValue: string,
  mode: ColumnFilterMode,
): boolean {
  const source = value.toLocaleLowerCase("vi");
  const target = filterValue.trim().toLocaleLowerCase("vi");
  if (!target) return true;
  switch (mode) {
    case "equals":
      return source === target;
    case "startsWith":
      return source.startsWith(target);
    case "endsWith":
      return source.endsWith(target);
    case "notContains":
      return !source.includes(target);
    default:
      return source.includes(target);
  }
}

export function TransferInPage() {
  const [rows, setRows] = useState<ImportableTransferOrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  // Data the in-place goods-receipt dialog needs (mirrors PurchaseOrdersPage).
  const [providers, setProviders] = useState<InventoryProvider[]>([]);
  // Keep the organization-wide list for viewing the source XK document, but
  // only expose active-branch warehouses to the destination receipt form.
  const [storages, setStorages] = useState<InventoryStorage[]>([]);
  const receivingStorages = useMemo(() => {
    const activeBranchId =
      localStorage.getItem("active_branch_id") ??
      localStorage.getItem("branch_id");
    return activeBranchId
      ? storages.filter((storage) => storage.branchId === activeBranchId)
      : [];
  }, [storages]);
  // Open the Nhập kho form in-place for this transfer (no navigation away).
  const [receiveTarget, setReceiveTarget] =
    useState<ImportableTransferOrderListItem | null>(null);
  // Open the export (XK) goods-issue view dialog for this transfer, in-place.
  const [viewExportRow, setViewExportRow] =
    useState<ImportableTransferOrderListItem | null>(null);
  const [viewIssue, setViewIssue] = useState<GoodsIssue | null>(null);

  const openReceiptFor = useCallback(
    (row: ImportableTransferOrderListItem) => setReceiveTarget(row),
    [],
  );

  const openExportView = useCallback(
    async (row: ImportableTransferOrderListItem) => {
      if (!row.exportGoodsIssueId) {
        toast.error("Không tìm thấy phiếu xuất kho của chứng từ này.");
        return;
      }
      try {
        // Org-scoped endpoint: the export issue lives in the source branch, so
        // the branch-scoped goods-issues GET would 404 from this (destination) branch.
        const { data } = await apiClient.get<GoodsIssue>(
          `/inventory/transfer-orders/${row.id}/export-goods-issue`,
        );
        setViewExportRow(row);
        setViewIssue(data);
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      }
    },
    [],
  );

  const closeExportView = useCallback(() => {
    setViewIssue(null);
    setViewExportRow(null);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      // Only transfers awaiting import — once received they move to the Nhập kho
      // screen and drop off this list.
      const params = new URLSearchParams();
      if (period.from) params.set("from", period.from);
      if (period.to) params.set("to", period.to);
      const { data } = await apiClient.get<ImportableTransferOrderListItem[]>(
        `/inventory/transfer-orders/importable?${params}`,
      );
      setRows(data);
      setSelectedId((current) =>
        current && data.some((row) => row.id === current) ? current : null,
      );
      setSelectedIds((current) => {
        const availableIds = new Set(data.map((row) => row.id));
        return new Set([...current].filter((id) => availableIds.has(id)));
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRows([]);
      setSelectedId(null);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]);

  const loadProviders = useCallback(async () => {
    try {
      const { data } = await apiClient.get<
        PaginatedResponse<InventoryProvider>
      >("/inventory/providers?page=1&pageSize=200");
      setProviders(data.data);
    } catch {
      // best-effort — the dialog falls back to ids if names are missing
    }
  }, []);

  const loadStorages = useCallback(async () => {
    try {
      // Load all org storages (no branchId filter) so the XK view dialog can
      // show the source branch's warehouse names alongside destination ones.
      const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
        "/inventory/storages?page=1&pageSize=200",
      );
      setStorages(data.data);
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadProviders();
    void loadStorages();
  }, [loadProviders, loadStorages]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const values: Record<string, string> = {
          requestedDate: row.requestedDate?.slice(0, 10) ?? "",
          exportDocument: row.exportGoodsIssueDocumentNumber ?? "",
          counterparty: row.counterpartyName ?? "",
          totalAmount: moneyFmt.format(row.totalAmount),
          sourceBranch: row.sourceBranchName || row.sourceBranchId,
          notes: row.notes ?? "",
          documentType: "Phiếu xuất kho điều chuyển",
          status: receiveStatusLabel(row),
        };
        return Object.entries(filters).every(([key, filter]) =>
          matchesText(
            values[key] ?? "",
            filter.value,
            filter.mode ?? DEFAULT_COLUMN_FILTER_MODE,
          ),
        );
      }),
    [filters, rows],
  );

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [filteredRows.length, page, pageSize]);

  const columns = useMemo<TableColumn<ImportableTransferOrderListItem>[]>(
    () => [
      {
        key: "requestedDate",
        label: "Ngày",
        width: 120,
        filterKind: "date",
        render: (row) => formatDate(row.requestedDate),
      },
      {
        key: "exportDocument",
        label: "Số phiếu xuất",
        width: 150,
        render: (row) =>
          row.exportGoodsIssueDocumentNumber ? (
            <button
              type="button"
              className="font-medium text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                openExportView(row);
              }}
            >
              {row.exportGoodsIssueDocumentNumber}
            </button>
          ) : (
            "—"
          ),
      },
      {
        key: "counterparty",
        label: "Đối tượng",
        width: 180,
        render: (row) => row.counterpartyName ?? "—",
      },
      {
        key: "totalAmount",
        label: "Tổng tiền",
        width: 140,
        headerClassName: "text-right",
        className: "text-right tabular-nums",
        render: (row) => moneyFmt.format(row.totalAmount),
      },
      {
        key: "sourceBranch",
        label: "Điều chuyển từ",
        width: 190,
        render: (row) => row.sourceBranchName || row.sourceBranchId,
      },
      {
        key: "notes",
        label: "Diễn giải",
        width: 300,
        render: (row) => row.notes || "—",
      },
      {
        key: "documentType",
        label: "Loại chứng từ",
        width: 210,
        render: () => "Phiếu xuất kho điều chuyển",
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 150,
        filterKind: "select",
        filterPlaceholder: "Tất cả",
        filterOptions: [
          {
            value: "Chưa nhập kho",
            label: "Chưa nhập kho",
          },
          {
            value: "Đã nhập kho",
            label: "Đã nhập kho",
          },
        ],
        render: (row) => receiveStatusLabel(row),
      },
    ],
    [openExportView],
  );

  const detailColumns = useMemo<
    TableColumn<ImportableTransferOrderListItem["lines"][number]>[]
  >(
    () => [
      {
        key: "itemCode",
        label: "Mã SKU",
        width: 160,
        render: (row) => row.itemCode || "—",
      },
      {
        key: "itemName",
        label: "Tên hàng hóa",
        width: 320,
        render: (row) => row.itemName || "—",
      },
      {
        key: "storageName",
        label: "Kho",
        width: 200,
        render: (row) => row.storageName || "—",
      },
      {
        key: "locationCode",
        label: "Vị trí",
        width: 140,
        render: (row) => row.locationCode || "—",
      },
      {
        key: "unit",
        label: "Đơn vị tính",
        width: 120,
        render: (row) => row.unit || "—",
      },
      {
        key: "quantity",
        label: "Số lượng",
        width: 110,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => moneyFmt.format(row.quantity),
      },
      {
        key: "unitPrice",
        label: "Đơn giá",
        width: 130,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => moneyFmt.format(row.unitPrice),
      },
      {
        key: "lineTotal",
        label: "Thành tiền",
        width: 140,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => moneyFmt.format(row.lineTotal),
      },
      {
        key: "notes",
        label: "Ghi chú",
        width: 180,
        render: (row) => row.notes || "—",
      },
    ],
    [],
  );

  const toolbarItems = useMemo<ToolbarItem[]>(
    () => [
      {
        id: "receive",
        label: "Nhập kho",
        icon: PackagePlus,
        disabled: !selectedRow || !isReceivableTransfer(selectedRow),
        onClick: () => selectedRow && openReceiptFor(selectedRow),
      },
      {
        id: "view",
        label: "Xem",
        icon: Eye,
        disabled: !selectedRow,
        onClick: () => selectedRow && openExportView(selectedRow),
      },
      {
        id: "refresh",
        label: loading ? "Đang tải" : "Nạp",
        icon: RefreshCw,
        disabled: loading,
        onClick: () => void loadRows(),
      },
    ],
    [loadRows, loading, openExportView, openReceiptFor, selectedRow],
  );

  const updateFilter = useCallback(
    (key: string, patch: Partial<ColumnFilter>) =>
      setFilters((current) => ({
        ...current,
        [key]: {
          mode: current[key]?.mode ?? DEFAULT_COLUMN_FILTER_MODE,
          value: current[key]?.value ?? "",
          ...patch,
        },
      })),
    [],
  );

  const allPageRowsSelected =
    pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.id));

  const selectOnlyRow = useCallback((row: ImportableTransferOrderListItem) => {
    setSelectedId(row.id);
    setSelectedIds(new Set([row.id]));
  }, []);

  const toggleRow = useCallback(
    (row: ImportableTransferOrderListItem) => {
      const removing = selectedIds.has(row.id);
      setSelectedIds((current) => {
        const next = new Set(current);
        if (removing) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
      if (removing) {
        if (selectedId === row.id) setSelectedId(null);
      } else {
        setSelectedId(row.id);
      }
    },
    [selectedId, selectedIds],
  );

  return (
    <DocumentListShell
      title={
        <InventoryPageTitle>Điều chuyển từ cửa hàng khác</InventoryPageTitle>
      }
      tabs={<InventoryTabBar activeId="transfer-in" />}
      toolbar={
        <PageToolbar
          items={toolbarItems}
          tone="primary"
          className="m-2 rounded-md"
        />
      }
      filters={
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          onApply={() => void loadRows()}
        />
      }
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={filteredRows.length}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onRefresh={() => void loadRows()}
          disabled={loading}
        />
      }
      detailPanel={
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="h-9 border-b px-3 pt-2 text-sm font-semibold">
            <span className="border-b-2 border-primary px-1 pb-2">
              Chi tiết
            </span>
          </div>
          {selectedRow ? (
            <BaseDataTable
              columns={detailColumns}
              rows={selectedRow.lines}
              loading={false}
              emptyLabel="Phiếu điều chuyển chưa có dòng hàng hóa."
              getRowKey={(row) => row.id || row.itemId}
            />
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              Chọn một phiếu để xem chi tiết.
            </p>
          )}
        </div>
      }
      detailInitialHeight={220}
    >
      <BaseDataTable
        columns={columns}
        rows={pageRows}
        loading={loading}
        emptyLabel="Không có phiếu điều chuyển phù hợp."
        getRowKey={(row) => row.id}
        onRowClick={selectOnlyRow}
        onRowDoubleClick={(row) => {
          if (isReceivableTransfer(row)) openReceiptFor(row);
        }}
        leadingColumn={{
          width: 40,
          header: (
            <input
              type="checkbox"
              aria-label="Chọn phiếu trên trang"
              checked={allPageRowsSelected}
              onChange={() => {
                if (allPageRowsSelected) {
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    pageRows.forEach((row) => next.delete(row.id));
                    return next;
                  });
                  setSelectedId(null);
                  return;
                }
                setSelectedIds((current) => {
                  const next = new Set(current);
                  pageRows.forEach((row) => next.add(row.id));
                  return next;
                });
                setSelectedId(pageRows[0]?.id ?? null);
              }}
            />
          ),
          filterHeader: null,
          cell: (row) => (
            <input
              type="checkbox"
              aria-label={`Chọn ${row.exportGoodsIssueDocumentNumber ?? row.documentNumber}`}
              checked={selectedIds.has(row.id)}
              onClick={(event) => event.stopPropagation()}
              onChange={() => toggleRow(row)}
            />
          ),
          cellClassName: "text-center",
        }}
        columnFilterControl={{
          filters,
          onModeChange: (key, mode) => updateFilter(key, { mode }),
          onValueChange: (key, value) => updateFilter(key, { value }),
        }}
        actionsLabel=""
        renderActions={(row) => (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 py-0"
            disabled={!isReceivableTransfer(row)}
            onClick={() => openReceiptFor(row)}
          >
            Nhập kho
          </Button>
        )}
      />

      {viewIssue && viewExportRow && (
        <GoodsIssueFormDialog
          mode="view"
          initial={viewIssue}
          customers={providers}
          storages={storages}
          actionLoading={false}
          onClose={closeExportView}
          onSaved={async () => {
            closeExportView();
            await loadRows();
          }}
          onEdit={() => {}}
          onProcessReceive={() => {
            const target = viewExportRow;
            closeExportView();
            setReceiveTarget(target);
          }}
        />
      )}

      {receiveTarget && (
        <GoodsReceiptFormDialog
          mode="create"
          initial={null}
          providers={providers}
          storages={receivingStorages}
          actionLoading={false}
          onClose={() => setReceiveTarget(null)}
          onSaved={async () => {
            setReceiveTarget(null);
            await loadRows();
          }}
          onEdit={() => {}}
          autoOpenTransferPicker
          autoSelectTransferOrder={{
            id: receiveTarget.id,
            sourceBranchName: receiveTarget.sourceBranchName,
            exportGoodsIssueId: receiveTarget.exportGoodsIssueId,
            exportGoodsIssueDocumentNumber:
              receiveTarget.exportGoodsIssueDocumentNumber,
          }}
        />
      )}
    </DocumentListShell>
  );
}
