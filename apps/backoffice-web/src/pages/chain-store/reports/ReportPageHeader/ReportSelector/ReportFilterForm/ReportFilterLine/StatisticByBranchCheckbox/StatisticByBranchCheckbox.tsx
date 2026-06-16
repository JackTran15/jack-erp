interface Props {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function StatisticByBranchCheckbox({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-[#333333]">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#353B8C]"
      />
      Thống kê theo chi nhánh
    </label>
  );
}
