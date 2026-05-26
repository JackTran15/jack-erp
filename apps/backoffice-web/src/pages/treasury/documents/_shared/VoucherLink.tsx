import { cn } from "@erp/ui";

interface Props {
  code?: string;
  clickable: boolean;
  onClick?: () => void;
}

export function VoucherLink({ code, clickable, onClick }: Props) {
  if (!code) return null;
  if (!clickable) {
    return <span>{code}</span>;
  }
  return (
    <button
      type="button"
      className={cn(
        "text-left font-medium !text-sm text-indigo-500 underline-offset-2 hover:text-indigo-600 hover:underline",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {code}
    </button>
  );
}
