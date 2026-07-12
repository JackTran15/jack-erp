import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { MapPinIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { resetCheckoutSelections } from "@erp/pos/lib/common/reset-app-state";
import { useMyBranchesQuery } from "@erp/pos/hooks/react-query/use-query-branch";
import { useSwitchBranchMutation } from "@erp/pos/hooks/react-query/use-query-auth";
import { parseAccessTokenPayload } from "@erp/pos/lib/common/parseJwt";
import { useNavigate } from "react-router-dom";
import type { BranchRow } from "@erp/pos/interfaces/branch.interface";

export function PosLocationIndicator() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const branchId = usePosBranchStore((s) => s.branchId);
  const setBranch = usePosBranchStore((s) => s.setBranch);
  const switchBranch = useSwitchBranchMutation();
  // Guards the mount-time token sync so a failed switch isn't retried in a loop.
  const syncedBranchRef = useRef<string | null>(null);

  const { data: branches = [] } = useMyBranchesQuery();

  useEffect(() => {
    if (!branches.length) return;
    const match = branches.find((b) => b.id === branchId);
    const resolved = match ?? branches[0];
    setBranch(resolved.id, resolved.name);
    if (!match) navigate("/", { replace: true });

    // The branch store is persisted, so after a fresh login the active JWT's
    // branch (login default) can differ from the persisted selection. The API
    // derives actor.branchId from the JWT — not the X-Branch-Id header — so a
    // mismatch makes branch-scoped reads (e.g. preferred-shelf lookup) hit the
    // wrong branch. Re-issue the token to match the selected branch.
    const token = localStorage.getItem("access_token");
    const jwtBranchId = token
      ? parseAccessTokenPayload(token)?.branchId ?? null
      : null;
    if (
      jwtBranchId &&
      jwtBranchId !== resolved.id &&
      syncedBranchRef.current !== resolved.id &&
      !switchBranch.isPending
    ) {
      // Mark before firing so a failure isn't retried in a render loop; a
      // manual pick via the dropdown can always retry the switch.
      syncedBranchRef.current = resolved.id;
      switchBranch.mutate(resolved.id, {
        // Re-issued token (new branch) is live; drop caches so every query
        // refetches under the correct branch.
        onSuccess: () => queryClient.clear(),
      });
    }
  }, [branches, branchId, setBranch, navigate, switchBranch, queryClient]);

  const current: BranchRow | null =
    branches.find((b) => b.id === branchId) ?? null;

  const handleChange = (branch: BranchRow) => {
    if (branch.id === branchId || switchBranch.isPending) return;
    switchBranch.mutate(branch.id, {
      onSuccess: () => {
        // Persist the new active branch and drop caches so every query refetches
        // under the freshly issued token (new actor.branchId) + X-Branch-Id.
        syncedBranchRef.current = branch.id;
        setBranch(branch.id, branch.name);
        // Giỏ hàng/lựa chọn gắn theo chi nhánh (locationId, tồn, giá) → reset về
        // trạng thái sạch khi đổi chi nhánh, tránh dùng nhầm dữ liệu chi nhánh cũ.
        resetCheckoutSelections();
        queryClient.clear();
      },
      onError: () => {
        toast.error("Không thể đổi chi nhánh. Vui lòng thử lại.");
      },
    });
  };

  return (
    <PosSelect<BranchRow>
      items={branches}
      value={current}
      onChange={handleChange}
      itemKey={(b) => b.id}
      renderItem={(b) => b.name}
      disabled={switchBranch.isPending}
      ariaLabel="Chi nhánh"
      placeholder="Chọn chi nhánh"
      emptyText="Không có chi nhánh"
      prefix={<MapPinIcon size={14} className="text-gray-500" />}
      className="min-w-[180px]"
    />
  );
}
