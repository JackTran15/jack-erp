import { formatVnd } from "@erp/ui";
import type { CustomerStatsData } from "./types";

export interface CustomerStatsPanelProps {
  stats?: CustomerStatsData;
}

interface StatPair {
  label: string;
  /** Renderer for the pair's value — string for monetary, number for counts. */
  render: (data: CustomerStatsData) => string;
}

const PURCHASE_PAIRS: StatPair[] = [
  { label: "Tổng chi tiêu", render: (d) => formatVnd(d.totalSpent) },
  { label: "Số lượng hóa đơn", render: (d) => String(d.invoiceCount) },
];

const DEBT_PAIRS: StatPair[] = [
  { label: "Tổng dư nợ khách hàng", render: (d) => formatVnd(d.debtTotal) },
  { label: "Số lượng chứng từ", render: (d) => String(d.debtDocumentCount) },
];

const EMPTY_STATS: CustomerStatsData = {
  totalSpent: 0,
  invoiceCount: 0,
  debtTotal: 0,
  debtDocumentCount: 0,
};

/**
 * Right-side stats panel in the "Tổng quan" tab (spec 4.6).
 * Two sections (Mua hàng / Công nợ) with labels in muted gray and values
 * rendered in primary indigo.
 */
export function CustomerStatsPanel({ stats }: CustomerStatsPanelProps) {
  const data = stats ?? EMPTY_STATS;

  return (
    <div className="flex h-[280px] flex-col gap-4 rounded-lg bg-[#F3F4F6] px-6 py-5">
      <Section heading="Mua hàng" pairs={PURCHASE_PAIRS} data={data} />
      <div className="border-t border-gray-200" />
      <Section heading="Công nợ" pairs={DEBT_PAIRS} data={data} />
    </div>
  );
}

interface SectionProps {
  heading: string;
  pairs: StatPair[];
  data: CustomerStatsData;
}

function Section({ heading, pairs, data }: SectionProps) {
  return (
    <div>
      <h3 className="text-[16px] font-bold text-gray-900">{heading}</h3>
      <div
        className="mt-2 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${pairs.length}, minmax(0, 1fr))` }}
      >
        {pairs.map((p) => (
          <div key={p.label}>
            <div className="text-[13px] text-gray-500">{p.label}</div>
            <div className="mt-1 text-[22px] font-bold leading-tight text-[#5C6BC0]">
              {p.render(data)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
