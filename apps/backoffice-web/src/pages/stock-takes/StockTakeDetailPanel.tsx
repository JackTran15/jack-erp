import { useMemo, useState } from "react";
import { PageTabBar } from "@erp/ui";
import type { StockTake } from "./stock-takes.types";

interface Props {
  stockTake: StockTake | null;
}

type DetailTabId = "lines" | "participants";

const TABS = [
  { id: "lines" as DetailTabId, label: "Chi tiết" },
  { id: "participants" as DetailTabId, label: "Thành viên tham gia" },
];

export function StockTakeDetailPanel({ stockTake }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTabId>("lines");

  const lines = stockTake?.lines ?? [];

  const totals = useMemo(() => {
    let expectedTotal = 0;
    let countedTotal = 0;
    let varianceTotal = 0;
    for (const l of lines) {
      const exp = Number(l.expectedQty || 0);
      const cnt = l.countedQty == null ? null : Number(l.countedQty);
      expectedTotal += exp;
      if (cnt != null) {
        countedTotal += cnt;
        varianceTotal += cnt - exp;
      }
    }
    return { expectedTotal, countedTotal, varianceTotal };
  }, [lines]);

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
              {lines.length === 0 ? (
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
                              ? "text-emerald-600"
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
                        ? "text-emerald-600"
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
