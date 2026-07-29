export interface SubHeadingProps {
  label: string;
}

/** Sub-heading used inside SectionCard bodies to group rows (e.g. "Thu (1)", "Bàn giao"). */
export function SubHeading({ label }: SubHeadingProps) {
  return (
    <div className="border-b-2 border-[#E5E7EB] pb-1 pt-1 text-base font-semibold text-[#1F2233]">
      {label}
    </div>
  );
}
