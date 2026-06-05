import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@erp/ui";
import { ChevronDown } from "lucide-react";
import { useMyBranches } from "../../hooks/iam/useBranches";
import { getActiveBranch, setActiveBranch } from "../../lib/auth-storage";

export function BranchSelector() {
  const { data: branches } = useMyBranches();

  if (!branches?.length) return null;

  const activeBranchId = getActiveBranch();
  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const displayName = activeBranch?.name ?? "Chọn cửa hàng";

  const handleSelect = (id: string) => {
    setActiveBranch(id);
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-52 items-center justify-between gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-white outline-none transition-all hover:border-white/50 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/50"
        >
          {displayName}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[180px]">
        <DropdownMenuRadioGroup
          value={activeBranchId ?? ""}
          onValueChange={handleSelect}
        >
          {branches.map((branch) => (
            <DropdownMenuRadioItem key={branch.id} value={branch.id}>
              {branch.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
