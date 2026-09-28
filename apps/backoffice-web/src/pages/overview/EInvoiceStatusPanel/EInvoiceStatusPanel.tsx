import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchEInvoiceStatusMock } from "../_mock/eInvoiceStatus.mock";
import { formatViNumber } from "../_lib/format";
import { PRODUCT_SHARE_PERIODS, type OverviewPeriod } from "../_lib/period";
import { HeaderPeriodSelect } from "../ChartWidgetPanel/WidgetHeader/HeaderPeriodSelect/HeaderPeriodSelect";
import { RefreshIconButton } from "../RefreshIconButton/RefreshIconButton";
import { EInvoiceStatusDetailModal } from "./EInvoiceStatusDetailModal/EInvoiceStatusDetailModal";

/** Row 1 (chỉ chế độ chuỗi) — "Tình hình phát hành HĐĐT", dữ liệu mock. */
export function EInvoiceStatusPanel() {
  const [period, setPeriod] = useState<OverviewPeriod>("this_month");
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["overview", "einvoice-status", "chain", period],
    queryFn: () => fetchEInvoiceStatusMock(period),
  });

  // Tổng của card = tổng các dòng trong modal, để hai nơi luôn khớp nhau.
  const branches = data?.branches ?? [];
  const rows = [
    { key: "unissued", label: "Hóa đơn chưa phát hành", value: sum(branches, "unissued") },
    { key: "failed", label: "Hóa đơn phát hành lỗi", value: sum(branches, "failed") },
    { key: "issued", label: "Hóa đơn đã phát hành", value: sum(branches, "issued") },
  ];

  return (
    <section className="flex flex-col gap-3 rounded bg-[linear-gradient(180deg,#FFFFFF_0%,#FFFFFF_55%,#C9D4F8_80%,#5B7BE8_100%)] px-4 pb-4 pt-3 xl:w-[300px] xl:shrink-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="max-w-[112px] text-[13px] leading-5 text-[#616161]">
          Tình hình phát hành HĐĐT
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <HeaderPeriodSelect value={period} periods={PRODUCT_SHARE_PERIODS} onChange={setPeriod} />
          <RefreshIconButton onClick={() => void refetch()} loading={isFetching} />
        </div>
      </div>

      <article className="flex flex-col rounded-sm border border-[#E0E0E0] border-t-[3px] border-t-[#2B2E6E] bg-white px-4 pb-1">
        <h3 className="flex h-9 items-center border-b border-[#E0E0E0] text-[13px] font-bold leading-5 text-[#212121]">
          Trạng thái phát hành HĐĐT
        </h3>
        {rows.map((row) => (
          <div key={row.key} className="flex h-9 items-center justify-between gap-4 text-[13px] leading-5">
            <span className="truncate text-[#212121]">{row.label}</span>
            <span className="font-bold tabular-nums text-[#2B2E6E]">
              {data ? formatViNumber(row.value) : "—"}
            </span>
          </div>
        ))}
        <div className="flex h-9 items-center">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            disabled={!data}
            className="text-[13px] font-medium leading-5 text-[#2B2E6E] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2B2E6E]/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Xem chi tiết
          </button>
        </div>
      </article>

      {detailOpen ? (
        <EInvoiceStatusDetailModal
          open
          branches={branches}
          onClose={() => setDetailOpen(false)}
        />
      ) : null}
    </section>
  );
}

function sum(
  branches: { unissued: number; failed: number; issued: number }[],
  field: "unissued" | "failed" | "issued",
): number {
  return branches.reduce((acc, b) => acc + b[field], 0);
}
