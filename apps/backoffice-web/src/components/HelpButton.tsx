import { HelpCircle } from "lucide-react";

interface HelpButtonProps {
  onClick?: () => void;
}

export function HelpButton({ onClick }: HelpButtonProps) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      <HelpCircle className="h-4 w-4" />
      Trợ giúp
    </button>
  );
}
