import { useState } from "react";
import { PageTabBar } from "@erp/ui";
import { CashCountDenominationTable } from "./CashCountDenominationTable";
import type { CashCountRecord } from "./cash-count.types";

interface Props {
  record: CashCountRecord | null;
}

type DetailTabId = "lines" | "participants";

const TABS = [
  { id: "lines" as DetailTabId, label: "Chi tiết" },
  { id: "participants" as DetailTabId, label: "Thành viên tham gia" },
];

export function CashCountDetailPanel({ record }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTabId>("lines");

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
                  : "text-primary hover:underline"
              }
            >
              {item.label}
            </button>
          )}
        />
      </div>

      {!record ? (
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          Chọn một phiếu kiểm kê để xem chi tiết.
        </div>
      ) : activeTab === "lines" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <CashCountDenominationTable lines={record.lines} readOnly />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted [&_th]:bg-muted">
              <tr>
                <th className="border-b border-r px-3 py-2 text-left font-medium">
                  Họ tên
                </th>
                <th className="border-b border-r px-3 py-2 text-left font-medium">
                  Chức danh
                </th>
                <th className="border-b px-3 py-2 text-left font-medium">
                  Đại diện
                </th>
              </tr>
            </thead>
            <tbody>
              {record.participants.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="border-b px-3 py-6 text-center text-muted-foreground"
                  >
                    Chưa có thành viên tham gia.
                  </td>
                </tr>
              ) : (
                record.participants.map((p, i) => (
                  <tr key={`${p.fullName}-${i}`} className="border-b">
                    <td className="border-r px-3 py-1.5">{p.fullName || "—"}</td>
                    <td className="border-r px-3 py-1.5">{p.title || "—"}</td>
                    <td className="px-3 py-1.5">{p.representative || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
