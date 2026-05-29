import { useMemo } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

const COLUMNS: Array<{ label: string; align?: "left" | "right"; filter?: string }> = [
  { label: "Ngày", filter: "≤" },
  { label: "Hóa đơn", filter: "*" },
  { label: "Số lượng", align: "right", filter: "≤" },
  { label: "Đơn vị tính", filter: "*" },
  { label: "Đơn giá", align: "right", filter: "≤" },
  { label: "Đơn giá sau KM", align: "right", filter: "≤" },
];

/**
 * Modal "Giá bán gần nhất" — tra cứu lịch sử bán của 1 sản phẩm. BE chưa có
 * endpoint, hiện render empty state placeholder. Swap `entries=[]` bằng hook
 * react-query khi BE ready (vd `useRecentPriceHistory(itemId)`).
 */
export function RecentPriceDialog() {
  const recentPriceDialogLineId = usePosCheckoutUiStore(
    (s) => s.recentPriceDialogLineId,
  );
  const closeRecentPriceDialog = usePosCheckoutUiStore(
    (s) => s.closeRecentPriceDialog,
  );
  const { cart } = useCheckoutSessionCart();

  const line = useMemo(
    () => cart.find((l) => l.lineId === recentPriceDialogLineId) ?? null,
    [cart, recentPriceDialogLineId],
  );

  // TODO: thay bằng query thật khi BE expose endpoint `recent-prices`.
  const entries: unknown[] = [];

  return (
    <PosDialog
      open={recentPriceDialogLineId !== null}
      onClose={closeRecentPriceDialog}
      width={1000}
    >
      <PosDialog.Header
        title={`Giá bán gần nhất${line ? ` - ${line.name}` : ""}`}
      />
      <PosDialog.Body className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#D1D5DB] bg-white px-3 text-[13px] text-[#2D3142]"
          >
            Hôm nay
            <span className="text-gray-400">▾</span>
          </button>
          <span className="text-[13px] text-[#6B7280]">
            {new Date().toLocaleDateString("vi-VN")}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="search"
              placeholder="SĐT, tên khách hàng"
              className="h-9 w-64 rounded-md border border-[#D1D5DB] bg-white px-3 text-[13px] placeholder:italic placeholder:text-gray-400 focus:border-[#5C6BC0] focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-[#E5E7EB]">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#F7F8FA] text-[#1F2433]">
              <tr className="h-10">
                {COLUMNS.map((c) => (
                  <th
                    key={c.label}
                    className={
                      c.align === "right"
                        ? "px-3 text-right font-semibold"
                        : "px-3 text-left font-semibold"
                    }
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
              <tr className="h-9 border-t border-[#E5E7EB] text-[#9CA3AF]">
                {COLUMNS.map((c) => (
                  <th
                    key={c.label + "-filter"}
                    className={
                      c.align === "right"
                        ? "px-3 text-right font-normal"
                        : "px-3 text-left font-normal"
                    }
                  >
                    {c.filter ?? ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <RecentPriceEmptyIllustration />
                      <span className="text-[13px] italic text-[#6B7280]">
                        Không có đơn hàng nào!
                      </span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-[13px] text-[#6B7280]">
          <div className="flex items-center gap-1">
            <PaginationBtn label="«" />
            <PaginationBtn label="‹" />
            <span className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-md bg-[#5B5FE6] px-2 text-white">
              1
            </span>
            <PaginationBtn label="›" />
            <PaginationBtn label="»" />
            <PaginationBtn label="↻" />
            <select
              defaultValue="100"
              className="ml-2 h-8 rounded-md border border-[#E2E5EA] bg-white px-2 text-[13px]"
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <span>0-0/0 kết quả</span>
        </div>
      </PosDialog.Body>
      <PosDialog.Footer onCancel={closeRecentPriceDialog} cancelLabel="Đóng" />
    </PosDialog>
  );
}

function PaginationBtn({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E2E5EA] bg-white text-[#6B7280] hover:bg-gray-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function RecentPriceEmptyIllustration() {
  return (
    <svg
      width="120"
      height="96"
      viewBox="0 0 120 96"
      fill="none"
      aria-hidden
    >
      <ellipse cx="60" cy="86" rx="44" ry="6" fill="#E8E9F5" />
      <path
        d="M22 36h76l-4 44H26L22 36z"
        fill="#6C6FE6"
      />
      <path d="M22 36l8-14h60l8 14H22z" fill="#5253CC" />
      <path d="M30 22h60l-6 10H36l-6-10z" fill="#E8E9F5" />
      <path
        d="M50 54a10 10 0 1 1 20 0M52 64h2M66 64h2"
        stroke="#1F2433"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="92" cy="22" r="10" fill="#FFFFFF" stroke="#1F2433" strokeWidth="2" />
      <text x="92" y="27" textAnchor="middle" fontSize="14" fontWeight="700" fill="#1F2433">
        ?
      </text>
    </svg>
  );
}
