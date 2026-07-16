interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Checkbox "Tự động áp dụng…" — dùng chung ở cả tab Khuyến mại và Điều kiện áp dụng. */
export function AutoApplyCheckbox({ checked, onChange }: Props) {
  return (
    <label className="mt-10 flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer rounded border border-input accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Tự động áp dụng chương trình khuyến mại này khi tính tiền
    </label>
  );
}
