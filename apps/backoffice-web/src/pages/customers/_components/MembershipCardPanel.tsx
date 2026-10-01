import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@erp/ui";
import { CreditCard } from "lucide-react";
import { erpApi, requireErpData } from "../../../lib/erp-api";
import { usePermissionCheck } from "../../../hooks/usePermissionCheck";
import { IssueMembershipCardDialog } from "../IssueMembershipCardDialog";
import { AdjustPointsDialog } from "./AdjustPointsDialog";

interface MembershipSummary {
  cardNumber: string;
  tier: string;
  points: number;
  pointsUsed: number;
}

interface CustomerSummary {
  customerId: string;
  purchases: { totalSpending: number; invoiceCount: number };
  debt: { totalOutstanding: number; documentCount: number };
  membership: MembershipSummary | null;
}

interface Props {
  customerId: string;
}

const TIER_LABELS: Record<string, string> = {
  none: "Không hạng",
  silver: "Bạc",
  gold: "Vàng",
  diamond: "Kim Cương",
};

const TIER_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  none: "outline",
  silver: "secondary",
  gold: "default",
  diamond: "default",
};

/** Khối "Thẻ thành viên": mã thẻ, hạng, điểm; dùng chung cho trang chi tiết và form sửa khách hàng. */
export function MembershipCardPanel({ customerId }: Props) {
  const qc = useQueryClient();
  const { has } = usePermissionCheck(["customer.points.adjust"]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["customer-summary", customerId],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<CustomerSummary>("/customers/{id}/summary", {
          params: { path: { id: customerId } },
        }),
      ),
  });
  const membership = summaryQuery.data?.membership ?? null;

  return (
    <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Thẻ thành viên</h2>
        </div>
        {summaryQuery.isSuccess && membership === null && (
          <Button type="button" size="sm" onClick={() => setIssueOpen(true)}>
            Cấp thẻ thành viên
          </Button>
        )}
        {membership && has("customer.points.adjust") && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
            Điều chỉnh điểm
          </Button>
        )}
      </div>

      {summaryQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : summaryQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được thông tin thẻ thành viên.</p>
      ) : membership ? (
        <dl className="space-y-2">
          <div className="flex items-center gap-2">
            <dt className="w-36 text-xs font-medium text-muted-foreground">Mã thẻ</dt>
            <dd className="font-mono text-sm">{membership.cardNumber}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-36 text-xs font-medium text-muted-foreground">Hạng thẻ</dt>
            <dd>
              <Badge variant={TIER_BADGE_VARIANT[membership.tier] ?? "outline"}>
                {TIER_LABELS[membership.tier] ?? membership.tier}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-36 text-xs font-medium text-muted-foreground">Điểm tích lũy</dt>
            <dd className="text-sm">{membership.points.toLocaleString("vi-VN")} điểm</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-36 text-xs font-medium text-muted-foreground">Điểm đã dùng</dt>
            <dd className="text-sm">{membership.pointsUsed.toLocaleString("vi-VN")} điểm</dd>
          </div>
        </dl>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">Chưa có thẻ</Badge>
          <span>Khách hàng này chưa được cấp thẻ thành viên.</span>
        </div>
      )}

      <IssueMembershipCardDialog
        customerId={customerId}
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onSuccess={() => void qc.invalidateQueries({ queryKey: ["customer-summary", customerId] })}
      />
      {membership && (
        <AdjustPointsDialog
          customerId={customerId}
          currentPoints={membership.points}
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
        />
      )}
    </div>
  );
}
