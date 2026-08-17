interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Checkbox "Tích điểm cho khách hàng" — chỉ dùng ở form Giảm giá hóa đơn (invoice-discount). */
export function AccruePointsCheckbox({ checked, onChange }: Props) {
  return (
    <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer rounded border border-input accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Tích điểm cho khách hàng
    </label>
  );
}
