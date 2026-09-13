import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { ProhibitedGlyphIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { usePosBranchDrift } from "@erp/pos/hooks/common/use-branch-drift";
import { useMyBranchesQuery } from "@erp/pos/hooks/react-query/use-query-branch";
import { useSwitchBranchMutation } from "@erp/pos/hooks/react-query/use-query-auth";
import { resetCheckoutSelections } from "@erp/pos/lib/common/reset-app-state";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

/**
 * Phiên đăng nhập là một-user-một-jti và access token nằm ở localStorage, nên mọi tab POS
 * dùng chung một chi nhánh. Tab khác đổi chi nhánh ⇒ tab này vẫn hiện tên cũ trên vỏ trong
 * khi danh mục, tồn kho và giá đã là của chi nhánh mới.
 *
 * Dialog bắt buộc chọn: ở quầy, bán nhầm kho chi nhánh khác là lỗi không sửa được bằng
 * một cú refresh.
 */
export function PosBranchDriftDialog() {
  const { drifted, sessionBranchId, tabBranchId, resetBaseline } =
    usePosBranchDrift();
  const { data: branches = [] } = useMyBranchesQuery();
  const setBranch = usePosBranchStore((s) => s.setBranch);
  const switchBranch = useSwitchBranchMutation();
  const queryClient = useQueryClient();

  const sessionBranch = branches.find((b) => b.id === sessionBranchId);
  const tabBranch = branches.find((b) => b.id === tabBranchId);

  // Chưa giải được tên thì chưa hỏi: dialog hiện uuid không cho thu ngân chọn được gì có
  // nghĩa. Danh sách tải xong thì lần render sau sẽ mở.
  if (!drifted || !sessionBranch || !tabBranch) return null;

  // Giỏ hàng, tồn và giá đều gắn theo chi nhánh nên phải dọn sạch, đúng bộ việc mà đường
  // đổi chi nhánh thường đang làm.
  const applyBranch = (id: string, name: string) => {
    setBranch(id, name);
    resetCheckoutSelections();
    queryClient.clear();
    resetBaseline();
  };

  // Token dùng chung đã mang chi nhánh mới rồi — không gọi switch-branch ở đây. Gọi thêm
  // sẽ xoay jti lần nữa và đá ngược chính tab vừa đổi.
  const useSessionBranch = () => {
    applyBranch(sessionBranch.id, sessionBranch.name);
  };

  const returnToTabBranch = () => {
    switchBranch.mutate(tabBranch.id, {
      onSuccess: () => applyBranch(tabBranch.id, tabBranch.name),
      onError: () => {
        toast.error("Không thể đổi chi nhánh. Vui lòng thử lại.");
      },
    });
  };

  return (
    <PosDialog open onClose={() => {}} dismissible={false} width={480}>
      <PosDialog.Header title="Chi nhánh đã được đổi ở tab khác" />
      <PosDialog.Body className="pt-5">
        <div className="flex gap-4">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-300 text-red-500"
            aria-hidden
          >
            <ProhibitedGlyphIcon />
          </span>
          <div className="min-w-0 flex-1 space-y-2 text-[15px] leading-relaxed text-gray-800">
            <p>
              Tab này đang hiển thị <strong>{tabBranch.name}</strong>, nhưng phiên đăng nhập
              đã chuyển sang <strong>{sessionBranch.name}</strong>. Hàng hoá và tồn kho đang
              tải về là của {sessionBranch.name}.
            </p>
            <p className="text-[14px] text-gray-600">
              Giỏ hàng đang mở trên tab này sẽ bị xoá. Chọn quay về {tabBranch.name} sẽ đổi
              chi nhánh cho cả phiên, nên tab kia sẽ được hỏi lại.
            </p>
          </div>
        </div>
      </PosDialog.Body>
      <footer className="flex h-16 items-center justify-end gap-2 border-t border-gray-200 bg-white px-6">
        <button
          type="button"
          disabled={switchBranch.isPending}
          onClick={returnToTabBranch}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-6 text-[14px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Quay về {tabBranch.name}
        </button>
        <button
          type="button"
          disabled={switchBranch.isPending}
          onClick={useSessionBranch}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#6366F1] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#4F46E5] active:bg-[#4338CA] disabled:cursor-not-allowed disabled:bg-[#C7D2FE]"
        >
          Dùng chi nhánh {sessionBranch.name}
        </button>
      </footer>
    </PosDialog>
  );
}
