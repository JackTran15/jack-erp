import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useOverviewScope } from "../_lib/useOverviewScope";
import { ActivityBreakdownModal } from "./ActivityBreakdownModal/ActivityBreakdownModal";
import { BREAKDOWN_CONFIG } from "./_breakdownConfig";
import {
  DAILY_ACTIVITY_PLACEHOLDER,
  fetchDailyActivity,
} from "../_mock/dailyActivity.mock";
import { DailyActivityCard } from "./DailyActivityCard/DailyActivityCard";
import { DailyActivityHeader } from "./DailyActivityHeader/DailyActivityHeader";

/** Row 1 — "Hoạt động trong ngày": 3 card tổng hợp số liệu trong ngày. */
export function DailyActivityPanel() {
  const scope = useOverviewScope();

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["overview", "daily-activity", scope.key],
    queryFn: () => fetchDailyActivity(scope.key),
  });

  // `key` của card/dòng đang mở modal. State phù du của panel nên không đưa vào store.
  const [detailKey, setDetailKey] = useState<string | null>(null);

  // Tìm điểm bấm tương ứng: header card (key của card) hoặc một dòng con.
  const detail = useMemo(() => {
    if (!detailKey || !data) return null;
    const card = data.cards.find((c) => c.key === detailKey);
    if (card?.breakdown) return { total: card.total, items: card.breakdown };
    for (const c of data.cards) {
      const row = c.rows.find((r) => r.key === detailKey);
      if (row?.breakdown) return { total: row.value, items: row.breakdown };
    }
    return null;
  }, [detailKey, data]);

  return (
    <section className="rounded bg-white">
      <DailyActivityHeader
        updatedAt={data ? new Date(data.updatedAt) : undefined}
        scopeLabel={scope.label}
        onRefresh={() => void refetch()}
        refreshing={isFetching}
      />
      <div className="grid grid-cols-1 items-stretch gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.cards ?? DAILY_ACTIVITY_PLACEHOLDER).map((card) => (
          <DailyActivityCard
            key={card.key}
            card={card}
            loading={isFetching || !data}
            onOpenDetail={setDetailKey}
          />
        ))}
      </div>

      {detail && detailKey ? (
        <ActivityBreakdownModal
          open
          title={BREAKDOWN_CONFIG[detailKey]?.title ?? ""}
          total={detail.total}
          items={detail.items}
          onClose={() => setDetailKey(null)}
        />
      ) : null}
    </section>
  );
}
