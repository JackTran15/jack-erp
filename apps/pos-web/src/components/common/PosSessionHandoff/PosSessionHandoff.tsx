import { useEffect, useRef, useState, type ReactNode } from "react";
import { authService } from "@erp/pos/services/auth.service";
import { branchService } from "@erp/pos/services/branch.service";
import { posHandoffParams } from "@erp/pos/lib/common/posHandoffParams";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { refreshOnce } from "@erp/pos/lib/common/token-refresh";
import { POS_REFRESH_TOKEN_KEY } from "@erp/pos/constants/common.constant";

export interface PosSessionHandoffProps {
  children: ReactNode;
}

/**
 * Bootstrap phiên đăng nhập POS trước khi `<Routes>` (và do đó
 * `PosRequireAuth`) render — hai đường, loại trừ lẫn nhau tuỳ có `?handoff=`
 * hay không:
 *
 * 1. Có `?handoff=`: đổi mã bàn giao từ ERP (nút "Bán hàng") lấy phiên mới.
 *    Mã hỏng/hết hạn thì im lặng rơi về màn đăng nhập — bàn giao là đường
 *    tắt, không phải đường duy nhất.
 * 2. Không có `?handoff=`: nếu access token đã hết hạn nhưng còn refresh
 *    token, chủ động refresh trước khi để `PosRequireAuth` chạy check `exp`
 *    đồng bộ của nó — tránh đá thẳng sang `/dang-nhap` khi phiên còn cứu
 *    được.
 *
 * Phải bọc ngoài `<Routes>` vì `PosRequireAuth` chạy đồng bộ nên nếu không
 * chặn render thì nó đá thẳng sang `/dang-nhap` trước khi việc bootstrap kịp
 * xong.
 */
export async function restoreSessionIfNeeded(): Promise<void> {
  if (authService.isAuthenticated()) return;
  if (!localStorage.getItem(POS_REFRESH_TOKEN_KEY)) return;
  await refreshOnce();
}

export const PosSessionHandoff = ({ children }: PosSessionHandoffProps) => {
  const { code, branchId } = posHandoffParams;
  const [pending, setPending] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (code) {
      void (async () => {
        try {
          await authService.exchangeHandoff(code);
          if (branchId) {
            // Phiên vừa tạo đã gắn sẵn chi nhánh này, chỉ cần tên để hiện trên
            // topbar — không gọi switch-branch (sẽ xoay phiên vừa nhận).
            const row = await branchService.getById(branchId).catch(() => null);
            usePosBranchStore
              .getState()
              .setBranch(
                branchId,
                row?.name?.trim() ? row.name : `Chi nhánh ${branchId.slice(0, 8)}…`,
              );
          }
        } catch {
          console.warn("Không nhận được phiên bàn giao từ ERP");
        } finally {
          setPending(false);
        }
      })();
      return;
    }

    void restoreSessionIfNeeded().finally(() => setPending(false));
  }, [code, branchId]);

  if (pending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-600">
        Đang mở phiên bán hàng...
      </div>
    );
  }

  return <>{children}</>;
};
