import { useParams } from "react-router-dom";

const WIP_LABELS: Record<string, string> = {
  "deposit-receipts-expenses": "Thu, chi tiền gửi",
  "deposit-reconciliation": "Đối chiếu tiền gửi",
  "deposit-ledger": "Sổ chi tiết tiền gửi",
  "offset-debt": "Đối trừ công nợ",
  "compensation-debt": "Bù trừ công nợ",
};

export function TreasuryWipPage() {
  const { slug } = useParams<{ slug: string }>();
  const label = (slug && WIP_LABELS[slug]) ?? "Chức năng quỹ tiền";

  return (
    <div className="flex h-full min-h-[240px] items-center justify-center px-6 py-12 text-center text-muted-foreground">
      {label} — chức năng đang phát triển.
    </div>
  );
}
