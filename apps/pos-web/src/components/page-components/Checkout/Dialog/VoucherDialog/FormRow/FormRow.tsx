import type { ReactNode } from "react";

interface FormRowProps {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}

export function FormRow({ label, htmlFor, children }: FormRowProps) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[120px_1fr] md:gap-6">
      <label htmlFor={htmlFor} className="text-[14px] text-[#6B7280]">
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
