import { PosToggle } from "@erp/pos/components/common/PosToggle/PosToggle";

export interface PosToggleFieldProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Inline "label + toggle switch" group. Used by the toolbar ("Tách dòng")
 * and the payment panel ("In hóa đơn"). Wrap consumers around this so they
 * don't need to repeat the layout each time.
 */
export function PosToggleField({ label, checked, onChange }: PosToggleFieldProps) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-gray-700">
      <span>{label}</span>
      <PosToggle
        checked={checked}
        onChange={onChange}
        ariaLabel={label}
      />
    </label>
  );
}
