interface Props {
  label: string;
  value: string;
}

export function InvoiceDetailInfoField({ label, value }: Props) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
