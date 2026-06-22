import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppModal, Button, Input, cn } from "@erp/ui";
import { Search } from "lucide-react";
import { BaseDataTable, type TableColumn } from "../table/BaseDataTable";
import { PaginationControls } from "../table/PaginationControls";
import {
  COUNTERPARTY_KIND_LABEL,
  counterpartyKey,
  useCounterpartySearch,
  type CounterpartyOption,
  type CounterpartySearchType,
} from "../../hooks/useCounterpartySearch";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

const ALL_TYPE_OPTIONS: ReadonlyArray<{
  value: CounterpartySearchType;
  label: string;
}> = [
  { value: "all", label: "Tất cả" },
  { value: "supplier", label: COUNTERPARTY_KIND_LABEL.supplier },
  { value: "customer", label: COUNTERPARTY_KIND_LABEL.customer },
  { value: "employee", label: COUNTERPARTY_KIND_LABEL.employee },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: CounterpartyOption) => void;
  /** Initial "Loại đối tượng" value. Defaults to "all". */
  defaultType?: CounterpartySearchType;
  /** Restrict the dropdown to these types (order preserved). Omit for all. */
  allowedTypes?: CounterpartySearchType[];
  title?: string;
  searchPlaceholder?: string;
}

export function CounterpartyPickerModal({
  open,
  onOpenChange,
  onSelect,
  defaultType = "all",
  allowedTypes,
  title = "Chọn đối tượng",
  searchPlaceholder = "Nhập mã hoặc tên đối tượng",
}: Props) {
  const search = useCounterpartySearch();

  const typeOptions = useMemo(
    () =>
      allowedTypes && allowedTypes.length > 0
        ? ALL_TYPE_OPTIONS.filter((o) => allowedTypes.includes(o.value))
        : ALL_TYPE_OPTIONS,
    [allowedTypes],
  );

  const [type, setType] = useState<CounterpartySearchType>(defaultType);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [items, setItems] = useState<CounterpartyOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const reqIdRef = useRef(0);

  const loadPage = useCallback(
    async (nextPage: number, query: string, ps: number, t: CounterpartySearchType) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const res = await search(t, query, nextPage, ps);
        if (reqId !== reqIdRef.current) return;
        setItems(res.data);
        setTotal(res.total);
        setPage(nextPage);
      } catch {
        if (reqId === reqIdRef.current) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [search],
  );

  // Reset and load a fresh first page each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setSearchInput("");
    setCommittedQuery("");
    setSelectedKey(null);
    setPage(1);
    void loadPage(1, "", pageSize, defaultType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commitSearch = () => {
    const q = searchInput.trim();
    setCommittedQuery(q);
    setSelectedKey(null);
    void loadPage(1, q, pageSize, type);
  };

  const changeType = (next: CounterpartySearchType) => {
    setType(next);
    setSelectedKey(null);
    void loadPage(1, committedQuery, pageSize, next);
  };

  const selectedItem = selectedKey
    ? items.find((it) => counterpartyKey(it) === selectedKey) ?? null
    : null;

  const handleConfirm = () => {
    if (!selectedItem) return;
    onSelect(selectedItem);
    onOpenChange(false);
  };

  const columns: TableColumn<CounterpartyOption>[] = useMemo(
    () => [
      {
        key: "code",
        label: "Mã đối tượng",
        width: 150,
        render: (r) => <span className="font-mono text-xs">{r.code || "—"}</span>,
      },
      { key: "name", label: "Tên đối tượng", render: (r) => r.name },
      {
        key: "kind",
        label: "Loại đối tượng",
        width: 130,
        render: (r) => COUNTERPARTY_KIND_LABEL[r.kind],
      },
      {
        key: "phone",
        label: "Điện thoại",
        width: 130,
        render: (r) => r.phone ?? "—",
      },
      { key: "address", label: "Địa chỉ", render: (r) => r.address ?? "—" },
    ],
    [],
  );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      defaultWidth={1040}
      defaultHeight={660}
      showFooter={false}
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-muted-foreground">Loại đối tượng</span>
            <select
              aria-label="Loại đối tượng"
              className={cn(
                "h-9 min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm",
              )}
              value={type}
              onChange={(e) => changeType(e.target.value as CounterpartySearchType)}
            >
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            className="flex-1"
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitSearch();
              }
            }}
            autoFocus
          />
          <Button type="button" onClick={commitSearch} className="gap-1.5">
            <Search className="h-4 w-4" />
            Tìm kiếm
          </Button>
        </div>

        <div className="relative min-h-0 flex-1">
          <BaseDataTable
            className="h-full"
            columns={columns}
            rows={items}
            loading={loading}
            emptyLabel="Không có dữ liệu."
            getRowKey={(row) => counterpartyKey(row)}
            onRowClick={(row) => setSelectedKey(counterpartyKey(row))}
            onRowDoubleClick={(row) => {
              onSelect(row);
              onOpenChange(false);
            }}
            leadingColumn={{
              width: 44,
              header: <span className="sr-only">Chọn</span>,
              cell: (row) => (
                <input
                  type="radio"
                  name="counterparty-pick"
                  aria-label={`Chọn ${row.name}`}
                  checked={selectedKey === counterpartyKey(row)}
                  onChange={() => setSelectedKey(counterpartyKey(row))}
                  onClick={(e) => e.stopPropagation()}
                />
              ),
            }}
          />
        </div>

        <PaginationControls
          className="shrink-0 bg-muted/40"
          page={page}
          pageSize={pageSize}
          total={total}
          disabled={loading}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={(p) => void loadPage(p, committedQuery, pageSize, type)}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setSelectedKey(null);
            void loadPage(1, committedQuery, s, type);
          }}
          onRefresh={() => void loadPage(page, committedQuery, pageSize, type)}
        />

        <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/40 px-3 py-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy bỏ
          </Button>
          <Button type="button" disabled={!selectedItem} onClick={handleConfirm}>
            Chọn
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
