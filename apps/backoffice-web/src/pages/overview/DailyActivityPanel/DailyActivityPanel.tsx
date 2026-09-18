import { useQuery } from "@tanstack/react-query";
import { useOverviewScope } from "../_lib/useOverviewScope";
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
          />
        ))}
      </div>
    </section>
  );
}
