import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { authService } from "@erp/pos/services/auth.service";
import { branchService } from "@erp/pos/services/branch.service";
import { parseAccessTokenPayload } from "@erp/pos/lib/common/parseJwt";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

/**
 * Áp dụng chi nhánh truyền từ ERP qua `?branchId=` (nút "Bán hàng"). Chỉ chạy
 * khi POS đã đăng nhập và branch nằm trong quyền của tài khoản; sau đó dọn param.
 */
export const PosBranchHandoff = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const incoming = searchParams.get("branchId");
    if (!incoming) return;
    handled.current = true;

    const strip = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("branchId");
      setSearchParams(next, { replace: true });
    };

    if (!authService.isAuthenticated()) {
      strip();
      return;
    }
    const token = localStorage.getItem("access_token");
    const payload = token ? parseAccessTokenPayload(token) : null;
    if (!payload || !payload.branchIds.includes(incoming)) {
      strip();
      return;
    }
    if (usePosBranchStore.getState().branchId === incoming) {
      strip();
      return;
    }

    void (async () => {
      try {
        await authService.switchBranch(incoming);
        const row = await branchService.getById(incoming).catch(() => null);
        const name = row?.name?.trim()
          ? row.name
          : `Chi nhánh ${incoming.slice(0, 8)}…`;
        usePosBranchStore.getState().setBranch(incoming, name);
      } catch {
        console.warn("Không thể chuyển chi nhánh POS sang", incoming);
      } finally {
        strip();
      }
    })();
  }, [searchParams, setSearchParams]);

  return null;
};
