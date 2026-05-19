interface ContactFieldRowProps {
  label: string;
  value?: string;
}

export function ContactFieldRow({ label, value }: ContactFieldRowProps) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-border/60 py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value?.trim() ? value : "—"}</span>
    </div>
  );
}
