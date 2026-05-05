import { useState } from "react";
import { formatVnd } from "@erp/ui";
import { PaginationBar } from "./PaginationBar";
import type { DebtEntry } from "./types";

export interface DebtTabProps {
  rows: DebtEntry[];
}

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(d: Date): string {
  const parts = dateFormatter.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} - ${get("hour")}:${get("minute")}`;
}

/**
 * "Công nợ" tab — same shell as `PurchaseHistoryTab` but with debt-document
 * columns. Filters are inert visual placeholders (mirrors purchase history).
 */
export function DebtTab({ rows }: DebtTabProps) {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const types = Array.from(new Set(rows.map((r) => r.documentType)));
  const filtered =
    typeFilter === "ALL"
      ? rows
      : rows.filter((r) => r.documentType === typeFilter);

  const total = filtered.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col">
      <div className="overflow-hidden border border-gray-200">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[#F3F4F6] text-[13px] font-semibold text-gray-700">
            <tr className="h-10">
              <th className="px-3 py-2 text-left">Ngày hóa đơn</th>
              <th className="px-3 py-2 text-left">Số chứng từ</th>
              <th className="px-3 py-2 text-left">Loại chứng từ</th>
              <th className="px-3 py-2 text-right">Giá trị</th>
              <th className="px-3 py-2 text-right">Dư nợ cuối</th>
              <th className="px-3 py-2 text-left">Chi nhánh</th>
            </tr>
            <tr className="h-9 border-t border-gray-200 bg-white text-[13px] font-normal">
              <td className="px-2 py-1">
                <FilterInput />
              </td>
              <td className="px-2 py-1">
                <FilterInput />
              </td>
              <td className="px-2 py-1">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-7 w-full rounded border border-gray-200 bg-white px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#5C6BC0]/30"
                >
                  <option value="ALL">Tất cả</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1">
                <FilterInput align="right" />
              </td>
              <td className="px-2 py-1">
                <FilterInput align="right" />
              </td>
              <td className="px-2 py-1">
                <FilterInput />
              </td>
            </tr>
          </thead>
          <tbody className="text-[14px]">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-[13px] text-gray-400"
                >
                  Chưa có chứng từ công nợ.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-gray-200 transition-colors hover:bg-gray-50"
                >
                  <td className="px-3 py-2.5">{formatDate(r.date)}</td>
                  <td className="px-3 py-2.5 font-medium text-[#5C6BC0]">
                    {r.documentNumber}
                  </td>
                  <td className="px-3 py-2.5">{r.documentType}</td>
                  <td className="px-3 py-2.5 text-right">
                    {formatVnd(r.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {formatVnd(r.remainingDebt)}
                  </td>
                  <td className="px-3 py-2.5">{r.branch}</td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot className="bg-white">
              <tr className="h-10 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
                <td colSpan={3} className="px-3">
                  Tổng chứng từ: {filtered.length}
                </td>
                <td className="px-3 text-right">{formatVnd(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <PaginationBar
        page={1}
        totalPages={1}
        pageSize={100}
        total={filtered.length}
      />
    </div>
  );
}

function FilterInput({ align = "left" }: { align?: "left" | "right" }) {
  return (
    <input
      type="text"
      className={
        align === "right"
          ? "h-7 w-full rounded border border-gray-200 bg-white px-2 text-right text-[13px] focus:border-[#5C6BC0] focus:outline-none"
          : "h-7 w-full rounded border border-gray-200 bg-white px-2 text-[13px] focus:border-[#5C6BC0] focus:outline-none"
      }
    />
  );
}
