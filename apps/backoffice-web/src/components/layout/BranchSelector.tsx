import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@erp/ui";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { SwitchBranchResponse } from "@erp/shared-interfaces";
import { useMyBranches } from "../../hooks/iam/useBranches";
import { erpApi, requireErpData } from "../../lib/erp-api";
import {
  getActiveBranch,
  persistSwitchBranchResponse,
} from "../../lib/auth-storage";

export function BranchSelector() {
  const { data: branches } = useMyBranches();
  const [switching, setSwitching] = useState(false);

  if (!branches?.length) return null;

  const activeBranchId = getActiveBranch();
  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const displayName = activeBranch?.name ?? "Chọn cửa hàng";

  const handleSelect = async (id: string) => {
    if (switching || id === activeBranchId) return;
    setSwitching(true);
    try {
      const res = requireErpData(
        await erpApi.POST<SwitchBranchResponse>("/auth/switch-branch", {
          body: { branchId: id },
        }),
      );
      persistSwitchBranchResponse(res, id);
      window.location.reload();
    } catch {
      toast.error("Không thể đổi chi nhánh. Vui lòng thử lại.");
      setSwitching(false);
    }
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
