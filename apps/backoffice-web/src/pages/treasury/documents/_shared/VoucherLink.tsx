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
        "text-left font-medium !text-sm text-info underline-offset-2 hover:text-info hover:underline",
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
