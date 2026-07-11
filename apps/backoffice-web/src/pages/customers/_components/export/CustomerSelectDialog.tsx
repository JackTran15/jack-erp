import { useState } from "react";
import { CustomerStatus } from "@erp/shared-interfaces";
import { AppModal, Button, Input } from "@erp/ui";
import { Search } from "lucide-react";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../../components/table/PaginationControls";
import { StatusBadge } from "../../../../components/status/StatusBadge";
import { useCrudRecords } from "../../../../components/crud/useCrudApi";
import { formatCustomerStatus } from "../../../../lib/customer-display";
import { useDebouncedValue } from "../../../../lib/use-debounced-value";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmLabel?: string;
  onConfirm: (customerIds: string[]) => void;
}

type CustomerRow = Record<string, unknown>;

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

function cellText(row: CustomerRow, key: string): string {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value);
}

const CUSTOMER_SELECT_COLUMNS: TableColumn<CustomerRow>[] = [
  {
    key: "code",
    label: "Mã khách hàng",
    width: 130,
    render: (row) => cellText(row, "code"),
  },
  {
    key: "name",
    label: "Tên khách hàng",
    width: 220,
    render: (row) => cellText(row, "name"),
  },
  {
    key: "phone",
    label: "Điện thoại",
    width: 130,
    render: (row) => cellText(row, "phone"),
  },
  {
    key: "email",
    label: "Email",
    width: 180,
    render: (row) => cellText(row, "email"),
  },
  {
    key: "status",
    label: "Trạng thái",
    width: 140,
    render: (row) => {
      const status = cellText(row, "status");
      return (
        <StatusBadge
          variant={status === CustomerStatus.ACTIVE ? "success" : "neutral"}
        >
          {formatCustomerStatus(status)}
        </StatusBadge>
      );
    },
  },
];

/**
 * Chọn khách hàng để xuất khẩu: tìm kiếm server-side (mã/tên/SĐT/email qua
 * `searchableFields` của generic CRUD) + phân trang; selection tích lũy qua
 * các trang/lần tìm (không bị reset như bảng danh sách chính).
 */
export function CustomerSelectDialog({
  open,
  onOpenChange,
  confirmLabel = "Xuất khẩu",
  onConfirm,
}: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const search = useDebouncedValue(searchInput.trim(), 300);

  const recordsQuery = useCrudRecords(
    "customers",
    {
      page,
      pageSize,
      sortBy: "code",
      sortOrder: "asc",
      search: search || undefined,
      filters: {},
    },
    open,
  );

  const rows = recordsQuery.data?.data ?? [];
  const total = recordsQuery.data?.total ?? 0;

  const pageIds = rows.map((row) => cellText(row, "id"));
  const areAllPageRowsSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearchInput("");
      setPage(1);
      setPageSize(DEFAULT_PAGE_SIZE);
      setSelectedIds(new Set());
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) return;
    onConfirm([...selectedIds]);
    handleClose(false);
  };

  if (!open) return null;

  return (
    <AppModal
      open
      onOpenChange={handleClose}
      preventOutsideClose
      title="Chọn khách hàng xuất khẩu"
      defaultWidth={860}
      defaultHeight={620}
      bodyClassName="flex flex-col gap-3 overflow-hidden"
      showFooter
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Đã chọn{" "}
            <strong className="font-semibold text-foreground">
              {selectedIds.size}
            </strong>{" "}
            khách hàng
            {selectedIds.size > 0 ? (
              <button
                type="button"
                className="ml-2 text-[#2563eb] hover:underline"
                onClick={() => setSelectedIds(new Set())}
              >
                Bỏ chọn tất cả
              </button>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Hủy bỏ
            </Button>
            <Button disabled={selectedIds.size === 0} onClick={handleConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="relative shrink-0">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="pl-8"
          placeholder="Tìm theo mã, tên, SĐT, email…"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <BaseDataTable
        columns={CUSTOMER_SELECT_COLUMNS}
        rows={rows}
        loading={recordsQuery.isLoading}
        emptyLabel="Không tìm thấy khách hàng."
        getRowKey={(row) => cellText(row, "id")}
        scrollContainerClassName="max-h-[min(56vh,440px)]"
        onRowClick={(row) => toggleRow(cellText(row, "id"))}
        leadingColumn={{
          width: 40,
          header: (
            <input
              type="checkbox"
              aria-label="Chọn tất cả trang này"
              checked={areAllPageRowsSelected}
              onChange={(event) => togglePage(event.target.checked)}
            />
          ),
          cell: (row) => {
            const id = cellText(row, "id");
            return (
              <input
                type="checkbox"
                aria-label={`Chọn ${cellText(row, "name")}`}
                checked={selectedIds.has(id)}
                onChange={() => toggleRow(id)}
                onClick={(event) => event.stopPropagation()}
              />
            );
          },
        }}
      />

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
      />
    </AppModal>
  );
}
