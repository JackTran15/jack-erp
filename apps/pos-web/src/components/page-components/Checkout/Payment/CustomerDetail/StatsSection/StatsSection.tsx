import type { CustomerStatsData } from "@erp/pos/lib/checkout/customerDetail.types";

interface StatPair {
  label: string;
  render: (data: CustomerStatsData) => string;
}

interface StatsSectionProps {
  heading: string;
  pairs: StatPair[];
  data: CustomerStatsData;
}

export function StatsSection({ heading, pairs, data }: StatsSectionProps) {
  return (
    <div>
      <h3 className="text-[16px] font-bold text-gray-900">{heading}</h3>
      <div
        className="mt-2 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${pairs.length}, minmax(0, 1fr))` }}
      >
        {pairs.map((pair) => (
          <div key={pair.label}>
            <div className="text-[13px] text-gray-500">{pair.label}</div>
            <div className="mt-1 text-[22px] font-bold leading-tight text-[#5C6BC0]">
              {pair.render(data)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
