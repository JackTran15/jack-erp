interface Props {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function StatisticByBranchCheckbox({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      Thống kê theo chi nhánh
    </label>
  );
}
