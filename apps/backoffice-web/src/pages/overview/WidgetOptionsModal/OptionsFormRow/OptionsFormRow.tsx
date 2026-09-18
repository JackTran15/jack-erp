import type { ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
}

/** Một dòng của form "Tùy chọn": cột nhãn cố định 112px + cột control co giãn. */
export function OptionsFormRow({ label, children }: Props) {
  return (
    <div className="grid min-h-9 grid-cols-[112px_1fr] items-center gap-0">
      <span className="text-[13px] leading-5 text-[#212121]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
