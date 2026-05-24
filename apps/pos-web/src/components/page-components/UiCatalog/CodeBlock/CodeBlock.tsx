import { cn } from "@erp/ui";
import { useState } from "react";
import { toast } from "sonner";

export interface CodeBlockProps {
  code: string;
  className?: string;
}

/** Khối hiển thị code ví dụ (nền tối) kèm nút sao chép vào clipboard. */
export const CodeBlock = ({ code, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Đã sao chép đoạn code");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không sao chép được");
    }
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-[#1f2937] bg-[#0f172a]",
        className,
      )}
    >
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 z-[1] rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20"
      >
        {copied ? "Đã chép" : "Sao chép"}
      </button>
      <pre className="overflow-x-auto p-4 pr-20 text-[12.5px] leading-relaxed text-[#e2e8f0]">
        <code>{code}</code>
      </pre>
    </div>
  );
};
