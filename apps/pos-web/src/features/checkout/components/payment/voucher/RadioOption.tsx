import { PosRadio } from "@erp/pos/components/form/PosRadio";

interface RadioOptionProps {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}

export function RadioOption({
  name,
  value,
  label,
  checked,
  onChange,
}: RadioOptionProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] text-[#1F2937]">
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <PosRadio selected={checked} className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#5B5BD6] peer-focus-visible:outline-offset-2" />
      </span>
      {label}
    </label>
  );
}
