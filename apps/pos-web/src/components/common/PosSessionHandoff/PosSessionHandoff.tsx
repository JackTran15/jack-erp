import { useEffect, useRef, useState, type ReactNode } from "react";
import { authService } from "@erp/pos/services/auth.service";
import { branchService } from "@erp/pos/services/branch.service";
import { posHandoffParams } from "@erp/pos/lib/common/posHandoffParams";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

export interface PosSessionHandoffProps {
  children: ReactNode;
}

/**
 * Nhận phiên bàn giao từ ERP qua `?handoff=` (nút "Bán hàng") để khỏi đăng nhập
 * lại. Phải bọc ngoài `<Routes>`: `PosRequireAuth` chạy đồng bộ nên nếu không
 * chặn render thì nó đá thẳng sang `/dang-nhap` trước khi mã kịp đổi.
 *
 * Mã hỏng/hết hạn thì im lặng rơi về màn đăng nhập như trước — bàn giao là
 * đường tắt, không phải đường duy nhất.
 */
export const PosSessionHandoff = ({ children }: PosSessionHandoffProps) => {
  const { code, branchId } = posHandoffParams;
  const [pending, setPending] = useState(() => Boolean(code));
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current) return;
    started.current = true;

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
