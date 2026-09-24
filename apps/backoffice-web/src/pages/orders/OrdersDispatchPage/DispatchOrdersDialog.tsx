import { useEffect, useState } from "react";
import { AppModal, Button, SingleSelect, cn, type SingleSelectOption } from "@erp/ui";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useBranches } from "../../../hooks/iam/useBranches";
import {
  useDispatchSalesOrders,
  useStockCheck,
  type DispatchAssignment,
  type StockCheckOrder,
} from "../../../hooks/orders/use-admin-sales-orders";
import { ValidateDispatchDialog } from "./ValidateDispatchDialog";

/** Một đơn đã tick trên lưới — chỉ những gì dialog cần để gọi tên nó. */
export interface DispatchCandidate {
  id: string;
  /** Mã chứng từ của đơn; rỗng khi server chưa trả (không bao giờ in UUID ra cho người dùng). */
  code: string;
  /** Người nhận hàng — để Admin nhận ra đơn nào. */
  recipient: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Các đơn đã tick, CHỤP lúc bấm "Điều phối". Sau khi Lưu, lưới tải lại và đơn
   * đã phân (hoặc bị người khác lấy mất) rời pool — danh sách này không được co
   * theo, nếu không bảng kết quả trống trơn đúng lúc cần đọc nó.
   */
  orders: DispatchCandidate[];
  /** Các đơn đã phân xong — trang bỏ tick đúng những dòng đó. */
  onDispatched: (orderIds: string[]) => void;
}

/** Chi nhánh Admin chọn cho từng đơn trong mẻ này: `orderId → branchId`. */
type BranchByOrder = Record<string, string>;

/**
 * Giá trị của mục "(Bỏ chọn)" — chọn nó là xoá khoá của đơn. Không dùng chuỗi
 * rỗng: `SingleSelect` hiện nhãn của option khớp `value`, mà dòng chưa chọn có
 * `value = ""` và phải hiện placeholder.
 */
const CLEAR_VALUE = "__clear__";
const UNSET = "";

const SELECT_CLASS = "h-7 px-2 text-xs";
const CELL_CLASS = "border border-border px-2 py-1 align-middle";
const HEAD_CLASS = "border border-border px-2 py-1 text-left font-semibold";

function orderLabel(order: DispatchCandidate): string {
  return order.code || "(chưa có mã)";
}

/**
 * Dialog "Điều phối" (A-48, ADR-13): Admin tick đơn trên lưới trước, rồi trong
 * dialog này chọn chi nhánh cho TỪNG đơn (AC-40, AC-41).
 *
 * - Ô chọn ở header cột "Chi nhánh" điền cho mọi dòng chưa phân; ô ở dòng chỉ
 *   đổi dòng đó. Dòng không chọn chi nhánh thì không gửi đi (AC-44).
 * - "Validate" đối chiếu tồn tại chi nhánh đã chọn của từng đơn (AC-43, A-39) và
 *   mở báo cáo chồng lên dialog này; đóng báo cáo là quay lại, lựa chọn còn nguyên.
 * - "Lưu" phân mỗi đơn về chi nhánh của chính nó (AC-42, ADR-11); không bắt
 *   Validate trước, thiếu hàng không chặn (A-38). Có đơn lỗi thì dialog KHÔNG
 *   đóng: lỗi hiện tại đúng dòng, dòng lỗi giữ chi nhánh đã chọn (AC-45).
 *
 * Mỗi lần mở là một mẻ mới — lựa chọn và kết quả của mẻ trước không đứng lại.
 */
export function DispatchOrdersDialog({
  open,
  onOpenChange,
  orders,
  onDispatched,
}: Props) {
  const [branchByOrder, setBranchByOrder] = useState<BranchByOrder>({});
  /** Đơn đã phân trong mẻ này → nhãn chi nhánh nó được phân về. */
  const [dispatchedTo, setDispatchedTo] = useState<Record<string, string>>({});
  /** Lỗi của lượt "Lưu" gần nhất, theo id đơn. */
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [validateOpen, setValidateOpen] = useState(false);
  /** Ảnh chụp của một lượt "Validate" — báo cáo không đổi khi Admin sửa lựa chọn. */
  const [validateChecks, setValidateChecks] = useState<StockCheckOrder[]>([]);

  const branchesQuery = useBranches(open);
  const dispatchMutation = useDispatchSalesOrders();
  const validateCheck = useStockCheck();

  useEffect(() => {
    if (!open) return;
    setBranchByOrder({});
    setDispatchedTo({});
    setFailures({});
    setValidateOpen(false);
    setValidateChecks([]);
  }, [open]);

  const loadingBranches = branchesQuery.isPending;
  const branchOptions: SingleSelectOption[] = (branchesQuery.data ?? []).map(
    (branch) => ({
      value: branch.id,
      label: branch.code ? `${branch.name} (${branch.code})` : branch.name,
    }),
  );
  const options: SingleSelectOption[] = [
    { value: CLEAR_VALUE, label: "(Bỏ chọn)" },
    ...branchOptions,
  ];
  const branchLabel = (branchId: string): string =>
    branchOptions.find((option) => option.value === branchId)?.label ?? "(chi nhánh)";

  const saveBusy = dispatchMutation.isPending;
  const validateBusy = validateCheck.isPending;
  const busy = saveBusy || validateBusy;

  /** Dòng còn chọn được: đơn đã phân trong mẻ này thì khoá lại. */
  const openOrders = orders.filter((order) => !(order.id in dispatchedTo));
  const openIds = openOrders.map((order) => order.id);

  const picked = new Set(openIds.map((id) => branchByOrder[id] ?? UNSET));
  const commonBranch = picked.size === 1 ? [...picked][0]! : UNSET;

  const assignments: DispatchAssignment[] = openOrders
    .filter((order) => branchByOrder[order.id])
    .map((order) => ({ orderId: order.id, branchId: branchByOrder[order.id]! }));
  const noAssignment = assignments.length === 0;

  const assign = (orderIds: string[], branchId: string) =>
    setBranchByOrder((current) => {
      const next = { ...current };
      for (const id of orderIds) {
        if (branchId === CLEAR_VALUE) delete next[id];
        else next[id] = branchId;
      }
      return next;
    });

  const handleValidate = async () => {
    if (noAssignment || busy) return;
    try {
      setValidateChecks(await validateCheck.mutateAsync(assignments));
      setValidateOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? `Không đối chiếu được tồn kho: ${error.message}`
          : "Không đối chiếu được tồn kho.",
      );
    }
  };

  const handleSave = async () => {
    if (noAssignment || busy) return;
    const batch = assignments;
    // Chụp nhãn lúc bấm: kết quả phải nói đúng chi nhánh đã gửi đi.
    const labels = Object.fromEntries(
      batch.map(({ orderId, branchId }) => [orderId, branchLabel(branchId)]),
    );

    const result = await dispatchMutation.mutateAsync(batch);

    setDispatchedTo((current) => {
      const next = { ...current };
      for (const id of result.dispatched) next[id] = labels[id] ?? "(chi nhánh)";
      return next;
    });
    setFailures(
      Object.fromEntries(result.failed.map((failure) => [failure.orderId, failure.message])),
    );
    if (result.dispatched.length > 0) onDispatched(result.dispatched);

    const summary = `Đã phân ${result.dispatched.length}/${batch.length} đơn.`;
    if (result.failed.length === 0) {
      toast.success(summary);
      onOpenChange(false);
      return;
    }
    toast.error(`${summary} ${result.failed.length} đơn không phân được.`);
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        Đóng
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={noAssignment || busy}
        onClick={() => void handleValidate()}
        title={
          noAssignment
            ? "Chọn chi nhánh cho ít nhất một đơn"
            : `Kiểm tra tồn của ${assignments.length} đơn tại chi nhánh đã chọn`
        }
      >
        {validateBusy ? "Đang kiểm tra…" : "Validate"}
      </Button>
      <Button
        type="button"
        className="!bg-primary-blue !text-white hover:!bg-primary-blue-hover"
        disabled={noAssignment || busy}
        onClick={() => void handleSave()}
        title={
          noAssignment
            ? "Chọn chi nhánh cho ít nhất một đơn"
            : `Phân ${assignments.length} đơn về chi nhánh đã chọn`
        }
      >
        {saveBusy ? "Đang lưu…" : "Lưu"}
      </Button>
    </div>
  );

  return (
    <>
      <AppModal
        open={open}
        onOpenChange={onOpenChange}
        title="Điều phối đơn hàng"
        description={`Chọn chi nhánh cho từng đơn trong ${orders.length} đơn đã tick. Đơn không chọn chi nhánh sẽ ở lại chờ phân.`}
        footer={footer}
        defaultWidth={820}
        bodyStretch={false}
        preventOutsideClose
        autoHeight
      >
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted">
                <th className={cn(HEAD_CLASS, "w-36")}>Mã đơn</th>
                <th className={HEAD_CLASS}>Người nhận</th>
                <th className={cn(HEAD_CLASS, "w-60")}>
                  <div className="flex flex-col gap-1">
                    <span>Chi nhánh</span>
                    <div data-dispatch-branch="all">
                      <SingleSelect
                        options={options}
                        value={commonBranch}
                        onValueChange={(branchId) => assign(openIds, branchId)}
                        placeholder={loadingBranches ? "Đang tải…" : "Chọn cho tất cả"}
                        disabled={loadingBranches || busy || openIds.length === 0}
                        searchable
                        searchPlaceholder="Tìm chi nhánh…"
                        className={cn(SELECT_CLASS, "font-normal")}
                        contentClassName="text-xs"
                      />
                    </div>
                  </div>
                </th>
                <th className={HEAD_CLASS}>Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const doneTo = dispatchedTo[order.id];
                const failure = failures[order.id];
                const branchId = branchByOrder[order.id] ?? UNSET;
                return (
                  <tr key={order.id} data-order-code={order.code}>
                    <td className={CELL_CLASS}>{orderLabel(order)}</td>
                    <td className={CELL_CLASS}>{order.recipient}</td>
                    <td className={CELL_CLASS}>
                      <div
                        data-dispatch-branch={order.code || order.id}
                        className={cn(failure && "rounded-md ring-1 ring-destructive")}
                      >
                        <SingleSelect
                          options={options}
                          value={branchId}
                          onValueChange={(next) => assign([order.id], next)}
                          placeholder={loadingBranches ? "Đang tải…" : "Chọn chi nhánh"}
                          disabled={loadingBranches || busy || Boolean(doneTo)}
                          searchable
                          searchPlaceholder="Tìm chi nhánh…"
                          className={SELECT_CLASS}
                          contentClassName="text-xs"
                        />
                      </div>
                    </td>
                    <td
                      className={cn(
                        CELL_CLASS,
                        failure && "text-destructive",
                        doneTo && "text-success",
                        !failure && !doneTo && "text-muted-foreground",
                      )}
                    >
                      {doneTo ? (
                        <span className="flex items-start gap-1">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <span>Đã phân về {doneTo}</span>
                        </span>
                      ) : failure ? (
                        <span className="flex items-start gap-1">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <span>{failure}</span>
                        </span>
                      ) : branchId ? (
                        "Chờ phân"
                      ) : (
                        "Chưa chọn chi nhánh"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AppModal>
      <ValidateDispatchDialog
        open={validateOpen}
        onOpenChange={setValidateOpen}
        checks={validateChecks}
      />
    </>
  );
}
