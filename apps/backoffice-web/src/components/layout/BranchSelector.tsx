import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@erp/ui";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { SwitchBranchResponse } from "@erp/shared-interfaces";
import { useMyBranches } from "../../hooks/iam/useBranches";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { getActiveBranch, persistSwitchBranchResponse } from "../../lib/auth-storage";
import { canViewChain } from "../../lib/permissions";
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
  const [switching, setSwitching] = useState(false);
  const attemptedSwitchFor = useRef<string | null>(null);

  // Reconcile the store against the authoritative branch (localStorage
  // active_branch_id — the same source api-axios sends as X-Branch-Id). This
  // covers a fresh tab / post-login state where the store was initialized
  // before the session existed, so the selector never drifts from the data.
  const moveTo = async (
    value: string,
    opts?: { notice?: string },
  ): Promise<void> => {
    const branch = branches?.find((b) => b.id === value);
    setSwitching(true);
    try {
      const res = requireErpData(
        await erpApi.POST<SwitchBranchResponse>("/auth/switch-branch", {
          body: { branchId: value },
        }),
      );
      persistSwitchBranchResponse(res, value);
      if (branch) selectBranch(branch.id, branch.name);
      if (opts?.notice) toast.info(opts.notice);
      window.location.reload();
    } catch {
      toast.error("Không thể đổi chi nhánh. Vui lòng thử lại.");
      setSwitching(false);
    }
  };

  useEffect(() => {
    if (isChain) return;
    const active = getActiveBranch();
    if (!active || (active === branchId && branchName)) return;
    const branch = branches?.find((b) => b.id === active);
    if (branch) selectBranch(branch.id, branch.name);
  }, [isChain, branchId, branchName, branches, selectBranch]);

  // Deactivating the store you are standing in leaves the header naming a
  // branch the server will no longer accept: `/branches/me` has dropped it and
  // the next token will too, but `active_branch_id` in localStorage still
  // points at it and api-axios keeps sending it as X-Branch-Id.
  //
  // Move to the first branch that is still operating. The dependency list
  // deliberately excludes `branchId`: this reacts to the *list* changing, and
  // once the switch lands the active branch is in the list again, so it settles.
  useEffect(() => {
    if (isChain) return;
    if (!branches) return;
    const active = getActiveBranch();
    if (!active || branches.some((b) => b.id === active)) return;
    // One attempt per stale branch id. Without this the error path spins:
    // moveTo sets `switching` false in its catch, `active_branch_id` is only
    // rewritten on success, and `branches` is a stable react-query reference —
    // so the guard above stays false and the effect fires again forever, one
    // failed POST and one toast per turn. It is reachable in practice:
    // BranchManagementPage.handleRecordSaved calls refresh() (which revokes the
    // current jti) and invalidateBranches() together, so the refetch can land
    // while the old token is already dead.
    if (attemptedSwitchFor.current === active) return;
    attemptedSwitchFor.current = active;
    const fallback = branches[0];
    if (!fallback) return;
    void moveTo(fallback.id, {
      notice: `Cửa hàng đang chọn đã ngừng hoạt động. Đã chuyển sang ${fallback.name}.`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, isChain]);

  if (!branches?.length) return null;

  // Nhân viên/quản lý chi nhánh chỉ thấy chi nhánh của mình, không thấy chuỗi.
  const showChainOption = canViewChain();
  const displayName = isChain
    ? "Chuỗi cửa hàng"
    : (branchName ??
      branches.find((b) => b.id === branchId)?.name ??
      "Chọn cửa hàng");
  const selectedValue = isChain ? CHAIN_OPTION_VALUE : (branchId ?? "");

  const handleSelect = async (value: string) => {
    // Chuỗi cửa hàng: chỉ là chế độ FE (mock), không gọi backend.
    if (value === CHAIN_OPTION_VALUE) {
      selectChain();
      return;
    }
    // Bỏ qua nếu đang đổi, hoặc đã chọn đúng chi nhánh đó (trừ khi đang ở chuỗi).
    if (switching || (!isChain && value === branchId)) return;
    await moveTo(value);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-52 items-center justify-between gap-1.5 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-1.5 text-sm font-medium text-sidebar-foreground outline-none transition-all hover:border-sidebar-active hover:bg-sidebar-active focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {displayName}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[180px]">
        <DropdownMenuRadioGroup value={selectedValue} onValueChange={handleSelect}>
          {showChainOption && (
            <>
              <DropdownMenuRadioItem value={CHAIN_OPTION_VALUE}>
                Chuỗi cửa hàng
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
            </>
          )}
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
