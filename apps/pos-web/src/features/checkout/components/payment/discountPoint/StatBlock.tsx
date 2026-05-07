import { cn } from "@erp/ui";

interface StatBlockProps {
  label: string;
  value: string;
  tone: "success" | "warning";
  align?: "left" | "right";
}

export function StatBlock({ label, value, tone, align = "left" }: StatBlockProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        align === "right" ? "items-end text-right" : "items-start text-left",
      )}
    >
      <span className="text-[13px] text-[#6B7280]">{label}</span>
      <span
        className={cn(
          "text-[22px] font-medium leading-none",
          tone === "success" ? "text-[#2EAA3D]" : "text-[#F59E0B]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
