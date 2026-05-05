import { useMemo, useState } from "react";
import { formatVnd } from "@erp/ui";
import { ChevronDownIcon } from "../../icons/Icon";
import { PaginationBar } from "./PaginationBar";
import { StatusBadge } from "./StatusBadge";
import type {
  PurchaseHistoryEntry,
  PurchaseHistoryStatus,
} from "./types";

export interface PurchaseHistoryTabProps {
  rows: PurchaseHistoryEntry[];
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
 * "Lịch sử mua hàng" tab — data table with header + filter row + body +
 * pagination + grand-total footer. Filters are visual placeholders for now;
 * wire `onFilterChange` once a real query layer exists.
 */
export function PurchaseHistoryTab({ rows }: PurchaseHistoryTabProps) {
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | PurchaseHistoryStatus
  >("ALL");

  const filtered = useMemo(
    () =>
      statusFilter === "ALL"
        ? rows
        : rows.filter((r) => r.status === statusFilter),
    [rows, statusFilter],
  );

  const grandTotal = filtered.reduce((s, r) => s + r.totalAmount, 0);

  return (
    <div className="flex flex-col">
      <div className="overflow-hidden border border-gray-200">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[#F3F4F6] text-[13px] font-semibold text-gray-700">
            <tr className="h-10">
              <Th>Ngày hóa đơn</Th>
              <Th>Số hóa đơn</Th>
              <Th>Tên cửa hàng</Th>
              <Th>Trạng thái</Th>
              <Th align="right">Tổng thanh toán</Th>
              <Th>Ghi chú</Th>
            </tr>
            <tr className="h-9 border-t border-gray-200 bg-white text-[13px] font-normal">
              <FilterCell>
                <FilterInput placeholder="" />
              </FilterCell>
              <FilterCell>
                <FilterInput placeholder="" leadingOperator="*" />
              </FilterCell>
              <FilterCell>
                <FilterInput placeholder="" leadingOperator="=" />
              </FilterCell>
              <FilterCell>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value as "ALL" | PurchaseHistoryStatus,
                    )
                  }
                  className="h-7 w-full rounded border border-gray-200 bg-white px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#5C6BC0]/30"
                >
                  <option value="ALL">Tất cả</option>
                  <option value="PAID">Đã thanh toán</option>
                  <option value="DEBT">Ghi nợ</option>
                </select>
              </FilterCell>
              <FilterCell>
                <FilterInput placeholder="" align="right" leadingOperator="≤" />
              </FilterCell>
              <FilterCell>
                <FilterInput placeholder="" leadingOperator="*" />
              </FilterCell>
            </tr>
          </thead>
          <tbody className="text-[14px]">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-[13px] text-gray-400"
                >
                  Chưa có hóa đơn nào.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-gray-200 transition-colors hover:bg-gray-50"
                >
                  <Td>{formatDate(r.invoiceDate)}</Td>
                  <Td>
                    <span className="font-medium text-[#5C6BC0]">
                      {r.invoiceNumber}
                    </span>
                  </Td>
                  <Td>{r.storeName || "—"}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td align="right">{formatVnd(r.totalAmount)}</Td>
                  <Td>{r.note ?? ""}</Td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot className="bg-white">
              <tr className="h-10 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
                <td colSpan={4} className="px-3">
                  Tổng hóa đơn: {filtered.length}
                </td>
                <td className="px-3 text-right">{formatVnd(grandTotal)}</td>
                <td />
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

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={
        align === "right" ? "px-3 py-2 text-right" : "px-3 py-2 text-left"
      }
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={
        align === "right" ? "px-3 py-2.5 text-right" : "px-3 py-2.5 text-left"
      }
    >
      {children}
    </td>
  );
}

function FilterCell({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1">{children}</td>;
}

function FilterInput({
  placeholder,
  leadingOperator,
  align = "left",
}: {
  placeholder?: string;
  leadingOperator?: string;
  align?: "left" | "right";
}) {
  return (
    <div className="flex h-7 items-center rounded border border-gray-200 bg-white px-2 focus-within:border-[#5C6BC0]">
      {leadingOperator ? (
        <button
          type="button"
          aria-label={`Toán tử lọc: ${leadingOperator}`}
          className="mr-1 inline-flex h-5 items-center text-[12px] font-semibold text-gray-500 hover:text-gray-700"
        >
          {leadingOperator}
          <ChevronDownIcon size={12} className="ml-0.5" />
        </button>
      ) : null}
      <input
        type="text"
        placeholder={placeholder}
        className={
          align === "right"
            ? "min-w-0 flex-1 bg-transparent text-right text-[13px] focus:outline-none"
            : "min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
        }
      />
    </div>
  );
}
