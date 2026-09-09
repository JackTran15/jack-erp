import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppModal,
  Button,
  Input,
  cn,
} from "@erp/ui";
import { Search } from "lucide-react";
import type { LookupSearchResult } from "../../../../components/forms/LookupField";
import { BaseDataTable, type TableColumn } from "../../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../../components/table/PaginationControls";
import { resolveLookupPaginationTotal } from "../../../../components/table/pagination.dto";
import {
  DEBT_COLLECTION_PARTNER_OPTIONS,
  PARTNER_LOOKUP_DEFAULT,
  PARTNER_LOOKUP_DIALOG_OPTIONS,
  PartnerLookupType,
} from "./voucher-partner.constants";
import {
  usePartnerSearch,
  type VoucherPartnerOption,
} from "./voucher-partner-search";
import {
  buildVoucherEntitySearchCacheKey,
  useVoucherEntitySearchStore,
  type VoucherEntitySearchTarget,
} from "./voucher-entity-search.store";

export type { VoucherEntitySearchTarget };

const LOOKUP_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: VoucherEntitySearchTarget;
  onSelectPartner?: (item: VoucherPartnerOption) => void;
  onSelectStaff?: (item: VoucherPartnerOption) => void;
}

function normalizeSearchResult(
  raw: LookupSearchResult<VoucherPartnerOption>,
) {
  if (Array.isArray(raw)) {
    return { items: raw, hasMore: false, total: raw.length };
  }
  const items = raw.items ?? [];
  return {
    items,
    hasMore: Boolean(raw.hasMore),
    total: raw.total ?? null,
  };
}

export function VoucherEntitySearchModal({
  open,
  onOpenChange,
  target,
  onSelectPartner,
  onSelectStaff,
}: Props) {
  const searchPartners = usePartnerSearch();
  const isStaffTarget = target === "staff";
  const isDebtCollectionTarget = target === "debtCollection";
  const lockedKind = isStaffTarget ? PartnerLookupType.EMPLOYEE : null;

  const getPageCache = useVoucherEntitySearchStore((s) => s.getPageCache);
  const setPageCache = useVoucherEntitySearchStore((s) => s.setPageCache);
  const clearPageCacheForTarget = useVoucherEntitySearchStore(
    (s) => s.clearPageCacheForTarget,
  );
  const patchSession = useVoucherEntitySearchStore((s) => s.patchSession);

  const [kindFilter, setKindFilter] = useState<PartnerLookupType>(() =>
    useVoucherEntitySearchStore.getState().getSession(target).kindFilter,
  );
  const [pageSize, setPageSize] = useState(
    () => useVoucherEntitySearchStore.getState().getSession(target).pageSize,
  );
  const [page, setPage] = useState(
    () => useVoucherEntitySearchStore.getState().getSession(target).page,
  );
  const [items, setItems] = useState<VoucherPartnerOption[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState(
    () => useVoucherEntitySearchStore.getState().getSession(target).searchInput,
  );
  const [committedQuery, setCommittedQuery] = useState(
    () =>
      useVoucherEntitySearchStore.getState().getSession(target).committedQuery,
  );
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () =>
      useVoucherEntitySearchStore.getState().getSession(target).selectedKey,
  );

  const reqIdRef = useRef(0);
  const wasOpenRef = useRef(false);

  const effectiveKindFilter: PartnerLookupType = lockedKind ?? kindFilter;

  const title = isStaffTarget
    ? "Chọn nhân viên thu"
    : isDebtCollectionTarget
      ? "Chọn thu nợ từ"
      : "Chọn đối tượng nộp";
  const searchPlaceholder = isStaffTarget
    ? "Nhập mã hoặc tên nhân viên"
    : isDebtCollectionTarget
      ? "Nhập mã hoặc tên"
      : "Nhập mã đối tượng nộp, tên đối tượng nộp";

  const paginationMeta = useMemo(
    () =>
      resolveLookupPaginationTotal(total, hasMore, page, pageSize, items.length),
    [total, hasMore, page, pageSize, items.length],
  );

  const persistSession = useCallback(
    (patch: Parameters<typeof patchSession>[1]) => {
      patchSession(target, {
        kindFilter,
        page,
        pageSize,
        searchInput,
        committedQuery,
        selectedKey,
        ...patch,
      });
    },
    [
      patchSession,
      target,
      kindFilter,
      page,
      pageSize,
      searchInput,
      committedQuery,
      selectedKey,
    ],
  );

  const loadPage = useCallback(
    async (
      nextPage: number,
      query: string,
      ps: number,
      kind: PartnerLookupType,
      opts?: { force?: boolean },
    ) => {
      const key = buildVoucherEntitySearchCacheKey(target, kind, query, nextPage, ps);
      const cached = !opts?.force ? getPageCache(key) : undefined;
      if (cached) {
        setItems(cached.items);
        setHasMore(cached.hasMore);
        setTotal(cached.total);
        setPage(nextPage);
        return;
      }

      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const raw = await searchPartners(kind, query, nextPage, ps);
        if (reqId !== reqIdRef.current) return;
        const pageResult = normalizeSearchResult(raw);
        setPageCache(key, pageResult);
        setItems(pageResult.items);
        setHasMore(pageResult.hasMore);
        setTotal(pageResult.total);
        setPage(nextPage);
      } catch {
        if (reqId === reqIdRef.current) {
          setItems([]);
          setHasMore(false);
          setTotal(null);
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [target, getPageCache, setPageCache, searchPartners],
  );

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        useVoucherEntitySearchStore.getState().patchSession(target, {
          kindFilter,
          page,
          pageSize,
          searchInput,
          committedQuery,
          selectedKey,
        });
      }
      wasOpenRef.current = false;
      return;
    }

    const session = useVoucherEntitySearchStore.getState().getSession(target);
    const resolvedKind = lockedKind ?? session.kindFilter;
    setKindFilter(resolvedKind);
    setPageSize(session.pageSize);
    setPage(session.page);
    setSearchInput(session.searchInput);
    setCommittedQuery(session.committedQuery);
    setSelectedKey(session.selectedKey);

    void loadPage(session.page, session.committedQuery, session.pageSize, resolvedKind);

    wasOpenRef.current = true;
  }, [open, target, lockedKind, loadPage]);

  const commitSearch = () => {
    const q = searchInput.trim();
    setCommittedQuery(q);
    persistSession({ searchInput, committedQuery: q, page: 1, selectedKey: null });
    setSelectedKey(null);
    void loadPage(1, q, pageSize, effectiveKindFilter);
  };

  const selectedItem = selectedKey
    ? items.find((it) => it.lookupKey === selectedKey) ?? null
    : null;

  const handleConfirm = () => {
    if (!selectedItem) return;
    if (isStaffTarget) {
      onSelectStaff?.(selectedItem);
    } else {
      onSelectPartner?.(selectedItem);
    }
    onOpenChange(false);
  };

  const columns: TableColumn<VoucherPartnerOption>[] = useMemo(() => {
    const codeLabel = isStaffTarget
      ? "Mã nhân viên"
      : isDebtCollectionTarget
        ? "Mã"
        : "Mã đối tượng nộp";
    const nameLabel = isStaffTarget
      ? "Tên nhân viên"
      : isDebtCollectionTarget
        ? "Tên"
        : "Tên đối tượng nộp";
    const cols: TableColumn<VoucherPartnerOption>[] = [
      {
        key: "code",
        label: codeLabel,
        width: 140,
        render: (r) => (
          <span className="font-mono text-xs">{r.code || "—"}</span>
        ),
      },
      {
        key: "name",
        label: nameLabel,
        render: (r) => r.name,
      },
    ];
    if (!isStaffTarget) {
      cols.push(
        {
          key: "kind",
          label: "Loại",
          width: 140,
          render: (r) => r.kindLabel,
        },
        {
          key: "phone",
          label: "Điện thoại",
          width: 120,
          render: (r) => r.phone ?? "—",
        },
      );
    } else {
      cols.push({
        key: "phone",
        label: "Điện thoại",
        width: 120,
        render: (r) => r.phone ?? "—",
      });
    }
    return cols;
  }, [isStaffTarget, isDebtCollectionTarget]);

  const kindSelect = (
    <select
      aria-label="Loại đối tượng"
      className={cn(
        "h-9 min-w-[10rem] shrink-0 rounded-md border border-input bg-background px-2 text-sm",
        lockedKind && "cursor-not-allowed bg-muted/40 opacity-80",
      )}
      value={effectiveKindFilter}
      disabled={Boolean(lockedKind)}
      onChange={(e) => {
        const next = e.target.value as PartnerLookupType;
        setKindFilter(next);
        clearPageCacheForTarget(target);
        persistSession({ kindFilter: next, page: 1, selectedKey: null });
        setSelectedKey(null);
        void loadPage(1, committedQuery, pageSize, next);
      }}
    >
      {(isStaffTarget
        ? [{ value: PartnerLookupType.EMPLOYEE, label: "Nhân viên" }]
        : isDebtCollectionTarget
          ? DEBT_COLLECTION_PARTNER_OPTIONS
          : PARTNER_LOOKUP_DIALOG_OPTIONS
      ).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
          {kindSelect}
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
            getRowKey={(row) => row.lookupKey}
            onRowClick={(row) => {
              setSelectedKey(row.lookupKey);
              persistSession({ selectedKey: row.lookupKey });
            }}
            leadingColumn={{
              width: 44,
              header: <span className="sr-only">Chọn</span>,
              cell: (row) => (
                <input
                  type="radio"
                  name="voucher-entity-pick"
                  aria-label={`Chọn ${row.name}`}
                  checked={selectedKey === row.lookupKey}
                  onChange={() => {
                    setSelectedKey(row.lookupKey);
                    persistSession({ selectedKey: row.lookupKey });
                  }}
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
          total={paginationMeta.total}
          totalEstimated={paginationMeta.estimated}
          hasMore={hasMore}
          pageItemCount={items.length}
          disabled={loading}
          pageSizeOptions={LOOKUP_PAGE_SIZE_OPTIONS}
          onPageChange={(p) => {
            persistSession({ page: p });
            void loadPage(p, committedQuery, pageSize, effectiveKindFilter);
          }}
          onPageSizeChange={(s) => {
            setPageSize(s);
            clearPageCacheForTarget(target);
            persistSession({ pageSize: s, page: 1, selectedKey: null });
            setSelectedKey(null);
            void loadPage(1, committedQuery, s, effectiveKindFilter);
          }}
          onRefresh={() =>
            void loadPage(page, committedQuery, pageSize, effectiveKindFilter, {
              force: true,
            })
          }
        />

        <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/40 px-3 py-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy bỏ
          </Button>
          <Button type="button" disabled={!selectedItem} onClick={handleConfirm}>
            Đồng ý
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
