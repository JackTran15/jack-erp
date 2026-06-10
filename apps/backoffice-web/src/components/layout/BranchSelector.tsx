import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@erp/ui";
import { ChevronDown } from "lucide-react";
import { useEffect } from "react";
import { useMyBranches } from "../../hooks/iam/useBranches";
import { CHAIN_OPTION_VALUE } from "../../store/common/branch/branch.constant";
import {
  useBranchStore,
  useIsChainSelected,
} from "../../store/common/branch/branch.store";

export function BranchSelector() {
  const { data: branches } = useMyBranches();
  const isChain = useIsChainSelected();
  const branchId = useBranchStore((s) => s.branchId);
  const branchName = useBranchStore((s) => s.branchName);
  const selectBranch = useBranchStore((s) => s.selectBranch);
  const selectChain = useBranchStore((s) => s.selectChain);

  useEffect(() => {
    if (isChain || !branchId || branchName) return;
    const branch = branches?.find((b) => b.id === branchId);
    if (branch) selectBranch(branch.id, branch.name);
  }, [isChain, branchId, branchName, branches, selectBranch]);

  if (!branches?.length) return null;

  const displayName = isChain
    ? "Chuỗi cửa hàng"
    : (branchName ??
      branches.find((b) => b.id === branchId)?.name ??
      "Chọn cửa hàng");
  const selectedValue = isChain ? CHAIN_OPTION_VALUE : (branchId ?? "");

  const handleSelect = (value: string) => {
    if (value === CHAIN_OPTION_VALUE) {
      selectChain();
      return;
    }
    const branch = branches.find((b) => b.id === value);
    if (branch) selectBranch(branch.id, branch.name);
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
        <DropdownMenuRadioGroup value={selectedValue} onValueChange={handleSelect}>
          <DropdownMenuRadioItem value={CHAIN_OPTION_VALUE}>
            Chuỗi cửa hàng
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
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
