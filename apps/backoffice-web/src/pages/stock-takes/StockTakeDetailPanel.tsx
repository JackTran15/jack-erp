import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { PageTabBar } from "@erp/ui";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type { StockTake } from "./stock-takes.types";

interface Props {
  /** Header only — status/members. May carry no lines (`includeLines=false`, ADR-09). */
  stockTake: StockTake | null;
  /**
   * The selected row's raw id, wired directly from `selectedId` — NOT
   * derived from `stockTake`/the header fetch. Keying the lines query off
   * the header result would make it wait for that round-trip before
   * starting; keying it off the raw id lets both fetches run in parallel.
   */
  voucherId: string | null;
}

type DetailTabId = "lines" | "participants";

const TABS = [
  { id: "lines" as DetailTabId, label: "Chi tiết" },
  { id: "participants" as DetailTabId, label: "Thành viên tham gia" },
];

interface StockTakeLineRow {
  id: string;
  lineNo: number;
  itemId: string;
  item: { id: string; code: string; name: string; unit: string } | null;
  locationId: string;
  location: { id: string; code: string; name: string } | null;
  expectedQty: string;
  countedQty: string | null;
  expectedValue: string;
  countedValue: string | null;
  note: string | null;
  reason: string | null;
}

/** Footer totals over the WHOLE voucher (AC-27), not the page(s) loaded so far. */
interface StockTakeLinesTotals {
  expectedTotal: number;
  countedTotal: number;
  varianceTotal: number;
}

/**
 * `POST /v2/inventory/stock-takes/:id/lines/search` response, ordered by
 * `lineNo` server-side.
 */
interface StockTakeLinesPage {
  data: StockTakeLineRow[];
  page: number;
  limit: number;
  total: number;
  totals: StockTakeLinesTotals;
}

const LINES_PAGE_SIZE = 50;

/** Exported for AC-18 pagination tests without rendering the component. */
export function getNextStockTakeLinesPageParam(last: {
  page: number;
  limit: number;
  total: number;
}): number | undefined {
  return last.page * last.limit < last.total ? last.page + 1 : undefined;
}

export function StockTakeDetailPanel({ stockTake, voucherId }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTabId>("lines");

  const linesQuery = useInfiniteQuery({
    queryKey: ["stock-take-lines", voucherId],
    queryFn: async ({ pageParam }) =>
      requireErpData(
        await erpApi.POST<StockTakeLinesPage>(
          "/v2/inventory/stock-takes/{id}/lines/search",
          {
            params: { path: { id: voucherId! } },
            body: { page: pageParam, limit: LINES_PAGE_SIZE },
          },
        ),
      ),
    initialPageParam: 1,
    getNextPageParam: getNextStockTakeLinesPageParam,
    enabled: !!voucherId,
  });

  const lines = useMemo(
    () => linesQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [linesQuery.data],
  );

  const hasNextPage = linesQuery.hasNextPage;
  const isFetchingNextPage = linesQuery.isFetchingNextPage;
  const fetchNextPage = linesQuery.fetchNextPage;

  // Sentinel row, observed instead of a scroll listener: the actual scroll
  // container (DocumentListShell's resizable detail-panel wrapper) lives
  // outside this component, so we can't attach onScroll to it directly.
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, lines.length]);

  // Footer totals over the WHOLE voucher (AC-27) — read off the first page
  // rather than summed from `lines`, which only ever holds the pages loaded
  // so far and would grow as the user scrolls.
  const totals = linesQuery.data?.pages[0]?.totals ?? {
    expectedTotal: 0,
    countedTotal: 0,
    varianceTotal: 0,
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b">
        <PageTabBar
          activeId={activeTab}
          items={TABS}
          renderItem={(item, isActive) => (
            <button
              type="button"
              onClick={() => setActiveTab(item.id as DetailTabId)}
              className={
                isActive
                  ? "font-semibold text-foreground"
                  : "text-primary-blue transition-colors hover:text-primary-blue-hover"
              }
            >
              {item.label}
            </button>
          )}
        />
      </div>

      {!stockTake ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Chọn một phiếu kiểm kê để xem chi tiết.
        </div>
      ) : activeTab === "lines" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted [&_th]:bg-muted">
              <tr>
                <th className="border-b border-r px-3 py-2 text-left">Mã SKU</th>
                <th className="border-b border-r px-3 py-2 text-left">
                  Tên hàng hóa
                </th>
                <th className="border-b border-r px-3 py-2 text-left">Vị trí</th>
                <th className="border-b border-r px-3 py-2 text-left">
                  Đơn vị tính
                </th>
                <th className="border-b border-r px-3 py-2 text-right">
                  Theo số
                </th>
                <th className="border-b border-r px-3 py-2 text-right">
                  Kiểm kê
                </th>
                <th className="border-b border-r px-3 py-2 text-right">
                  Chênh lệch
                </th>
                <th className="border-b px-3 py-2 text-left">Nguyên nhân</th>
              </tr>
            </thead>
            <tbody>
              {linesQuery.isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="border-b px-3 py-6 text-center text-muted-foreground"
                  >
                    Đang tải...
                  </td>
                </tr>
              ) : lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="border-b px-3 py-6 text-center text-muted-foreground"
                  >
                    Phiếu này chưa có dòng nào.
                  </td>
                </tr>
              ) : (
                lines.map((l) => {
                  const exp = Number(l.expectedQty || 0);
                  const cnt = l.countedQty == null ? null : Number(l.countedQty);
                  const variance = cnt == null ? null : cnt - exp;
                  return (
                    <tr key={l.id} className="border-b">
                      <td className="border-r px-3 py-1.5 font-mono text-xs">
                        {l.item?.code ?? l.itemId.slice(0, 8)}
                      </td>
                      <td className="border-r px-3 py-1.5">
                        {l.item?.name ?? "—"}
                      </td>
                      <td className="border-r px-3 py-1.5">
                        {l.location?.code ?? l.locationId.slice(0, 8)}
                      </td>
                      <td className="border-r px-3 py-1.5">
                        {l.item?.unit ?? "—"}
                      </td>
                      <td className="border-r px-3 py-1.5 text-right tabular-nums">
                        {exp.toLocaleString("vi-VN")}
                      </td>
                      <td className="border-r px-3 py-1.5 text-right tabular-nums">
                        {cnt == null ? "—" : cnt.toLocaleString("vi-VN")}
                      </td>
                      <td
                        className={`border-r px-3 py-1.5 text-right tabular-nums ${
                          variance == null
                            ? "text-muted-foreground"
                            : variance === 0
                              ? "text-success"
                              : "text-destructive font-medium"
                        }`}
                      >
                        {variance == null
                          ? "—"
                          : variance > 0
                            ? `+${variance.toLocaleString("vi-VN")}`
                            : variance.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {l.reason ?? ""}
                      </td>
                    </tr>
                  );
                })
              )}
              {hasNextPage ? (
                <tr ref={sentinelRef}>
                  <td
                    colSpan={8}
                    className="px-3 py-2 text-center text-xs text-muted-foreground"
                  >
                    Đang tải thêm...
                  </td>
                </tr>
              ) : null}
            </tbody>
            {lines.length > 0 ? (
              <tfoot className="sticky bottom-0 z-10 bg-muted font-medium [&_td]:bg-muted">
                <tr>
                  <td
                    colSpan={4}
                    className="border-t border-r px-3 py-1.5 text-right text-muted-foreground"
                  >
                    Tổng
                  </td>
                  <td className="border-t border-r px-3 py-1.5 text-right tabular-nums">
                    {totals.expectedTotal.toLocaleString("vi-VN")}
                  </td>
                  <td className="border-t border-r px-3 py-1.5 text-right tabular-nums">
                    {totals.countedTotal.toLocaleString("vi-VN")}
                  </td>
                  <td
                    className={`border-t border-r px-3 py-1.5 text-right tabular-nums ${
                      totals.varianceTotal === 0
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {totals.varianceTotal > 0
                      ? `+${totals.varianceTotal.toLocaleString("vi-VN")}`
                      : totals.varianceTotal.toLocaleString("vi-VN")}
                  </td>
                  <td className="border-t px-3 py-1.5" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted [&_th]:bg-muted">
              <tr>
                <th className="border-b border-r px-3 py-2 text-left">
                  Họ tên
                </th>
                <th className="border-b border-r px-3 py-2 text-left">
                  Chức danh
                </th>
                <th className="border-b px-3 py-2 text-left">Đại diện</th>
              </tr>
            </thead>
            <tbody>
              {(stockTake.members ?? []).length ? (
                stockTake.members?.map((member, index) => (
                  <tr key={member.id ?? index} className="border-b">
                    <td className="border-r px-3 py-2">{member.fullName}</td>
                    <td className="border-r px-3 py-2">
                      {member.title ?? ""}
                    </td>
                    <td className="px-3 py-2">
                      {member.representative ?? ""}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    Phiếu chưa có thành viên tham gia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
