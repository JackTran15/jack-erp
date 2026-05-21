import { cn } from "@erp/ui";

interface Props {
  label: string;
  value: string;
}

export function InvoiceDetailSummaryRow({ label, value }: Props) {
  return (
    <div className={cn("flex justify-between gap-4")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-semibold">{value}</span>
    </div>
  );
}
