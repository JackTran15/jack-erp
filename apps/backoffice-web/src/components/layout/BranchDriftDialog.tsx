import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@erp/ui";
import { toast } from "sonner";
import type { SwitchBranchResponse } from "@erp/shared-interfaces";
import { useBranchDrift } from "../../hooks/useBranchDrift";
import { useMyBranches } from "../../hooks/iam/useBranches";
import { persistSwitchBranchResponse } from "../../lib/auth-storage";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { HttpError } from "../../lib/http";

/**
 * Phiên đăng nhập là một-user-một-jti, không phải một-tab-một-phiên: đổi chi nhánh ở tab
 * này là đổi cho cả trình duyệt. Tab còn lại vì thế có thể đang hiển thị tên chi nhánh cũ
 * trong khi mọi số liệu trên màn hình đã là của chi nhánh mới.
 *
 * Dialog này bắt buộc chọn — mọi trạng thái khác đều là màn hình đang nói dối về chi nhánh
 * của dữ liệu.
 */
export function BranchDriftDialog() {
  const { drifted, sessionBranchId, tabBranchId } = useBranchDrift();
  const { data: branches } = useMyBranches();
  const [switching, setSwitching] = useState(false);
  const [returnBlocked, setReturnBlocked] = useState(false);

  const sessionBranch = branches?.find((b) => b.id === sessionBranchId);
  const tabBranch = branches?.find((b) => b.id === tabBranchId);

  // Chưa giải được tên thì chưa hỏi: một dialog hiện uuid không cho người dùng chọn được
  // gì có nghĩa. Danh sách tải xong thì lần render sau sẽ mở.
  if (!drifted || !sessionBranch || !tabBranch) return null;

  // `active_branch_id` đã là chi nhánh mới — đó chính là chỗ detector đọc ra. Chỉ cần tải
  // lại là header, store và dữ liệu cùng về một mối. Không gọi switch-branch: token dùng
  // chung đã mang chi nhánh mới, gọi thêm chỉ xoay jti và đá ngược tab kia.
  const useSessionBranch = () => {
    window.location.reload();
  };

  const returnToTabBranch = async () => {
    setSwitching(true);
    try {
      const res = requireErpData(
        await erpApi.POST<SwitchBranchResponse>("/auth/switch-branch", {
          body: { branchId: tabBranch.id },
        }),
      );
      persistSwitchBranchResponse(res, tabBranch.id);
      window.location.reload();
    } catch (err) {
      if (err instanceof HttpError && err.error.status === 403) {
        // Chi nhánh cũ không còn thuộc người dùng: không có đường quay về thật, hỏi tiếp
        // là hỏi vô nghĩa.
        setReturnBlocked(true);
        toast.error(`Bạn không còn quyền truy cập ${tabBranch.name}.`);
      } else {
        toast.error("Không thể đổi chi nhánh. Vui lòng thử lại.");
      }
      setSwitching(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Chi nhánh đã được đổi ở tab khác</DialogTitle>
          <DialogDescription>
            Tab này đang hiển thị <strong>{tabBranch.name}</strong>, nhưng phiên đăng nhập
            đã chuyển sang <strong>{sessionBranch.name}</strong>. Số liệu đang hiển thị là
            của {sessionBranch.name}.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Dữ liệu chưa lưu trên trang này sẽ mất khi đổi.
          {returnBlocked
            ? ""
            : ` Chọn quay về ${tabBranch.name} sẽ đổi chi nhánh cho cả phiên, nên tab kia sẽ được hỏi lại.`}
        </p>
        <DialogFooter>
          {!returnBlocked && (
            <Button
              variant="outline"
              disabled={switching}
              onClick={returnToTabBranch}
            >
              Quay về {tabBranch.name}
            </Button>
          )}
          <Button disabled={switching} onClick={useSessionBranch}>
            Dùng chi nhánh {sessionBranch.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
