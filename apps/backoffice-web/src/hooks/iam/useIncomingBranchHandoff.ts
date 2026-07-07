import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { SwitchBranchResponse } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import {
  getActiveBranch,
  persistSwitchBranchResponse,
} from "../../lib/auth-storage";
import { useBranchStore } from "../../store/common/branch/branch.store";
import { useMyBranches } from "./useBranches";

/**
 * Áp dụng chi nhánh truyền từ POS qua `?branchId=` (nút "Trang quản lý"). Chỉ
 * chuyển khi branch hợp lệ và khác chi nhánh hiện tại; reload để token mới có
 * hiệu lực, sau đó clear param trên URL.
 */
export function useIncomingBranchHandoff(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: branches } = useMyBranches();
  const selectBranch = useBranchStore((s) => s.selectBranch);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const incoming = searchParams.get("branchId");
    if (!incoming) return;
    if (!branches) return; // chờ danh sách chi nhánh để validate
    handled.current = true;

    const stripNoReload = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("branchId");
      setSearchParams(next, { replace: true });
    };

    const target = branches.find((b) => b.id === incoming);
    if (!target || incoming === getActiveBranch()) {
      stripNoReload();
      return;
    }

    void (async () => {
      try {
        const res = requireErpData(
          await erpApi.POST<SwitchBranchResponse>("/auth/switch-branch", {
            body: { branchId: incoming },
          }),
        );
        persistSwitchBranchResponse(res, incoming);
        selectBranch(target.id, target.name);
        // Reload để token/permission mới áp dụng, đồng thời dọn param.
        const clean = new URL(window.location.href);
        clean.searchParams.delete("branchId");
        window.location.replace(clean.toString());
      } catch {
        stripNoReload();
      }
    })();
  }, [searchParams, setSearchParams, branches, selectBranch]);
}
