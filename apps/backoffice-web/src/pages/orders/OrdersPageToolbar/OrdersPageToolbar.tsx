import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppModal, PageToolbar, Textarea, cn, type ToolbarItem } from "@erp/ui";
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  CheckCheck,
  History,
  Plus,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { erpApi, requireErpData } from "../../../lib/erp-api";
import { HttpError } from "../../../lib/http";
import { ADMIN_SALES_ORDERS_KEY } from "../../../hooks/orders/use-admin-sales-orders";
import type { StockCheckOrder } from "../../../hooks/orders/use-admin-sales-orders";
import {
  useBranchConfirmSalesOrders,
  useBranchSalesOrders,
  useBranchStockCheck,
} from "../../../hooks/orders/use-branch-sales-orders";
import {
  ConfirmOrdersDialog,
  type ConfirmOrderFailure,
} from "../ConfirmOrdersDialog/ConfirmOrdersDialog";
// Hộp huỷ đơn sống ở panel chi tiết vì panel là thứ DUY NHẤT cả ba màn cùng
// dựng (T-07-02). Toolbar mượn lại chính nó cho lối huỷ theo MẺ của `/orders`
// — một cài đặt, không phải hai.
import {
  OrdersCancelDialog,
  hasInvoiceToReverse,
  isCancellableOrder,
} from "../OrdersDetailPanel/OrdersDetailPanel";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";
import { formatOrderMoney } from "../_lib/order-format";
import { OrderHistoryModal } from "../OrderHistoryModal/OrderHistoryModal";
import { OrdersReconcileDialog } from "./OrdersReconcileDialog/OrdersReconcileDialog";

/** Tiền tố khoá cache của lưới đơn chi nhánh — xem `useBranchSalesOrders`. */
const BRANCH_SALES_ORDERS_KEY = ["branch-sales-orders"] as const;

/**
 * Nhãn trạng thái do `toOrderRow` sinh ra (`STATUS_LABELS`).
 *
 * So bằng NHÃN chứ không bằng mã trạng thái là điều bất đắc dĩ: `OrderRow`
 * không mang `status` thô, và `invoiceCode` thì luôn rỗng ở đường danh sách
 * (`toView` chỉ tra mã hoá đơn ở đường chi tiết). Đổi một chữ trong
 * `STATUS_LABELS` là phải đổi hai hằng này — và đây là chỗ duy nhất đọc chúng.
 */
const STATUS_SENT = "Chờ xử lý";
const STATUS_PROCESSED = "Đã xử lý";

/**
 * Câu tiếng Việt cho từng mã lỗi của `POST /admin/sales-orders/:id/return`.
 *
 * Bốn mã là bốn tình huống KHÁC nhau và người dùng phải làm bốn việc khác nhau,
 * nên chúng không được gộp thành một câu "không trả về được".
 */
const RETURN_ERROR_MESSAGES: Record<string, string> = {
  ORDER_HAS_INVOICE:
    "Đơn đã phát hành hoá đơn nên không trả về được. Muốn bỏ đơn thì huỷ đơn — hoá đơn sẽ được đảo theo.",
  ORDER_NOT_HELD_BY_BRANCH:
    "Đơn đang thuộc chi nhánh khác. Chỉ chi nhánh đang giữ đơn mới trả về được.",
  ORDER_NOT_DISPATCHED:
    "Đơn đã nằm ở pool chưa phân — có thể người khác vừa trả đơn này về trước.",
  ORDER_NOT_DISPATCHABLE:
    "Đơn không còn ở trạng thái chờ xử lý nên không trả về được.",
};

/**
 * Mã lỗi nghiệp vụ nằm ở `details.code`, KHÔNG ở `code` mức trên cùng.
 *
 * `HttpExceptionFilter` chỉ đẩy lên `code` cái `HTTP_409`; thân của
 * `ConflictException({ code, message })` được trải vào `details`. Đọc nhầm chỗ
 * là mọi lỗi 409 rơi về cùng một câu chung chung.
 */
function errorCodeOf(error: HttpError): string {
  const details = error.error.details;
  if (details && typeof details === "object") {
    const code = (details as Record<string, unknown>).code;
    if (typeof code === "string" && code) return code;
  }
  return error.error.code;
}

function describeReturnError(error: unknown): { code: string; message: string } {
  if (error instanceof HttpError) {
    const code = errorCodeOf(error);
    // Lỗi 400 (`reason` rỗng) đã là câu tiếng Việt từ server — giữ nguyên.
    return { code, message: RETURN_ERROR_MESSAGES[code] ?? error.error.message };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "Không trả được đơn về pool.",
  };
}

/** Một đơn đang được chọn để trả về — chỉ những gì dialog cần để gọi tên nó. */
interface ReturnCandidate {
  id: string;
  recipient: string;
  amount: number;
  statusLabel: string;
}

interface ReturnFailure {
  orderId: string;
  code: string;
  message: string;
}

interface ReturnBatchResult {
  returned: string[];
  failed: ReturnFailure[];
}

/**
 * Trả một MẺ đơn về pool kèm cùng một lý do (AC-21).
 *
 * Gọi TUẦN TỰ và không bao giờ reject, đúng hình của `useDispatchSalesOrders`:
 * mỗi đơn là một quyết định riêng, nên một đơn 409 không được huỷ kết quả của
 * những đơn đã trả về xong.
 *
 * Invalidate ở `onSettled` chứ không ở `onSuccess`: khi mọi đơn đều hỏng vì
 * `ORDER_NOT_DISPATCHED` thì lưới càng phải tải lại — những dòng đó đã rời chi
 * nhánh này rồi. Bắn cả khoá pool cấp tổ chức để màn `/orders/dispatch` thấy
 * đơn quay lại ngay, đó chính là bước 5 của vòng DISPATCH → RETURN → DISPATCH.
 */
function useReturnSalesOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderIds,
      reason,
    }: {
      orderIds: string[];
      reason: string;
    }): Promise<ReturnBatchResult> => {
      const returned: string[] = [];
      const failed: ReturnFailure[] = [];

      for (const orderId of orderIds) {
        try {
          requireErpData(
            await erpApi.POST<unknown>("/admin/sales-orders/{id}/return", {
              params: { path: { id: orderId } },
              body: { reason },
            }),
          );
          returned.push(orderId);
        } catch (error) {
          failed.push({ orderId, ...describeReturnError(error) });
        }
      }

      return { returned, failed };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BRANCH_SALES_ORDERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ADMIN_SALES_ORDERS_KEY });
    },
  });
}

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: ReturnCandidate[];
  /** Các đơn đã trả về xong — toolbar gọi để bỏ tick đúng những dòng đó. */
  onReturned: (orderIds: string[]) => void;
}

const REASON_MAX_LENGTH = 500;

/**
 * Hộp lý do + kết quả từng đơn.
 *
 * Nằm chung file với toolbar chứ không có thư mục riêng vì `touches:` của
 * T-06-02 chỉ mở đúng hai file giao diện; tách ra là sửa kế hoạch chứ không
 * phải sửa mã.
 *
 * Dialog KHÔNG đóng khi có đơn hỏng: "2 đơn đã trả về, 1 đơn đã có hoá đơn" là
 * hai tin khác nhau, và tin thứ hai chỉ đọc được khi nó còn nằm cạnh đúng dòng
 * đơn đó.
 */
function OrdersReturnDialog({
  open,
  onOpenChange,
  orders,
  onReturned,
}: ReturnDialogProps) {
  const [reason, setReason] = useState("");
  const [failures, setFailures] = useState<ReturnFailure[]>([]);
  const [returned, setReturned] = useState<string[]>([]);
  /**
   * Danh sách chụp lại lúc bấm xác nhận.
   *
   * Sau khi invalidate, đơn đã trả về rời khỏi lưới chi nhánh nên prop `orders`
   * co lại còn rỗng. Không chụp thì bảng kết quả trống trơn đúng lúc người dùng
   * cần đọc nó nhất.
   */
  const [submitted, setSubmitted] = useState<ReturnCandidate[] | null>(null);

  const returnMutation = useReturnSalesOrders();
  const pending = returnMutation.isPending;
  const displayed = submitted ?? orders;
  const trimmedReason = reason.trim();

  // Mỗi lần mở là một mẻ mới: lý do và kết quả của mẻ trước không được đứng lại đây.
  useEffect(() => {
    if (!open) return;
    setReason("");
    setFailures([]);
    setReturned([]);
    setSubmitted(null);
  }, [open]);

  const handleSave = async () => {
    if (!trimmedReason || orders.length === 0 || pending) return;

    const batch = [...orders];
    setSubmitted(batch);

    const result = await returnMutation.mutateAsync({
      orderIds: batch.map((order) => order.id),
      reason: trimmedReason,
    });

    setFailures(result.failed);
    setReturned(result.returned);
    onReturned(result.returned);

    if (result.failed.length === 0) {
      toast.success(`Đã trả ${result.returned.length} đơn về pool chưa phân.`);
      onOpenChange(false);
      return;
    }

    toast.error(
      `Trả về được ${result.returned.length}/${batch.length} đơn. ` +
        `${result.failed.length} đơn không trả về được.`,
    );
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Trả đơn về pool"
      description={`Trả ${displayed.length} đơn đã chọn về pool chưa phân. Đơn giữ nguyên trạng thái chờ xử lý, Admin sẽ phân lại.`}
      saveLabel={pending ? "Đang trả…" : "Trả đơn về"}
      cancelLabel="Đóng"
      saveDisabled={pending || !trimmedReason || orders.length === 0}
      onSave={handleSave}
      onCancel={() => onOpenChange(false)}
      defaultWidth={620}
      bodyStretch={false}
      preventOutsideClose
      autoHeight
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            Lý do trả đơn <span className="text-destructive">*</span>
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: hết hàng"
            maxLength={REASON_MAX_LENGTH}
            disabled={pending}
            rows={3}
          />
          <span className="text-xs text-muted-foreground">
            Bắt buộc, tối đa {REASON_MAX_LENGTH} ký tự. Lý do được lưu vào lịch sử
            điều phối của đơn.
          </span>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="border border-border px-2 py-1 text-left font-semibold">
                Người nhận
              </th>
              <th className="border border-border px-2 py-1 text-right font-semibold">
                Tổng thanh toán
              </th>
              <th className="border border-border px-2 py-1 text-left font-semibold">
                Kết quả
              </th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((order) => {
              const failure = failures.find((item) => item.orderId === order.id);
              const ok = returned.includes(order.id);
              return (
                <tr key={order.id}>
                  <td className="border border-border px-2 py-1">
                    {order.recipient || "(chưa có người nhận)"}
                  </td>
                  <td className="border border-border px-2 py-1 text-right tabular-nums">
                    {formatOrderMoney(order.amount)}
                  </td>
                  <td
                    className={cn(
                      "border border-border px-2 py-1",
                      failure && "text-destructive",
                      ok && "text-success",
                    )}
                  >
                    {failure ? (
                      <span className="flex items-start gap-1">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{failure.message}</span>
                      </span>
                    ) : ok ? (
                      "Đã trả về pool"
                    ) : (
                      "Chờ trả về"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppModal>
  );
}

export function OrdersPageToolbar() {
  const applied = useOrdersStore((s) => s.applied);
  const page = useOrdersStore((s) => s.page);
  const pageSize = useOrdersStore((s) => s.pageSize);
  const reloadNonce = useOrdersStore((s) => s.reloadNonce);
  const checkedOrderIds = useOrdersStore((s) => s.checkedOrderIds);
  const focusedOrderId = useOrdersStore((s) => s.focusedOrderId);
  const { reload, setCheckedOrderIds } = useOrdersActions();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecks, setConfirmChecks] = useState<StockCheckOrder[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [confirmFailures, setConfirmFailures] = useState<ConfirmOrderFailure[]>([]);
  const stockCheck = useBranchStockCheck();
  const confirmOrders = useBranchConfirmSalesOrders();
  const confirmPending = stockCheck.isPending || confirmOrders.isPending;

  // Cùng tham số ⇒ CÙNG `queryKey` với `OrdersPage`, nên đây là một lượt đọc
  // cache, không phải một lượt gọi API thứ hai. Toolbar không nhận prop nào từ
  // trang (và `OrdersPage.tsx` nằm ngoài `touches:` của T-06-02), nhưng nút
  // "Trả đơn về" phải biết trạng thái của đúng những dòng đang tick.
  const filterByCreatedDate = applied.dateField === "createdDate";
  const ordersQuery = useBranchSalesOrders({
    page,
    pageSize,
    from: filterByCreatedDate ? applied.from : undefined,
    to: filterByCreatedDate ? applied.to : undefined,
    reloadNonce,
  });

  // "Lịch sử" áp cho dòng đang XEM (focus), không phải các dòng tick (A-52).
  const focusedRow =
    (ordersQuery.data?.rows ?? []).find((row) => row.id === focusedOrderId) ??
    null;

  const checkedRows = (ordersQuery.data?.rows ?? []).filter((row) =>
    checkedOrderIds.includes(row.id),
  );
  const selected: ReturnCandidate[] = checkedRows.map((row) => ({
      id: row.id,
      recipient: row.recipientName,
      amount: row.totalAmount,
      statusLabel: row.paymentStatus,
  }));

  // Chỉ đơn web chưa duyệt mới gửi đi (ADR-12): đơn tư vấn viên không có bước
  // duyệt (AC-48), đơn đã duyệt thì duyệt lại là no-op. Dòng khác trong mẻ tick
  // bị bỏ qua chứ không chặn nút — tick lẫn là chuyện thường trên lưới hỗn hợp.
  const confirmableIds = checkedRows
    .filter((row) => row.needsConfirmation === true && !row.confirmedAt)
    .map((row) => row.id);
  const canConfirm = confirmableIds.length > 0 && !confirmPending;

  const confirmTooltip = (): string => {
    if (checkedRows.length === 0) return "Chọn ít nhất một đơn chờ duyệt";
    if (confirmableIds.length === 0) {
      return "Các đơn đang chọn không có đơn nào chờ duyệt";
    }
    const skipped = checkedRows.length - confirmableIds.length;
    return skipped > 0
      ? `Duyệt ${confirmableIds.length} đơn chờ duyệt (bỏ qua ${skipped} đơn không cần duyệt)`
      : `Duyệt ${confirmableIds.length} đơn đã chọn`;
  };

  /**
   * Duyệt từng id, gom kết quả. Đơn duyệt được thì bỏ tick; đơn hỏng GIỮ tick
   * để người dùng thấy ngay đơn nào còn phải xử lý (AC-33).
   */
  const runConfirm = async (orderIds: string[]) => {
    const result = await confirmOrders.mutateAsync(orderIds);
    setConfirmedIds(result.confirmed);
    setConfirmFailures(result.failed);
    setCheckedOrderIds(
      useOrdersStore
        .getState()
        .checkedOrderIds.filter((id) => !result.confirmed.includes(id)),
    );

    if (result.failed.length === 0) {
      toast.success(`Đã duyệt ${result.confirmed.length} đơn.`);
      setConfirmOpen(false);
      return;
    }
    toast.error(
      `Duyệt được ${result.confirmed.length}/${orderIds.length} đơn. ` +
        `${result.failed.length} đơn không duyệt được.`,
    );
    // Lỗi phải nằm cạnh mã đơn — kể cả khi lượt này là duyệt thẳng không qua dialog.
    setConfirmOpen(true);
  };

  /**
   * Luồng "Duyệt đơn" (AC-30, AC-31): đối chiếu tồn TẠI chi nhánh này → đủ hết
   * thì duyệt ngay; có đơn thiếu thì mở dialog để người dùng "Huỷ" hoặc "Vẫn
   * duyệt" (AC-32).
   */
  const handleConfirmClick = async () => {
    if (!canConfirm) return;
    setConfirmedIds([]);
    setConfirmFailures([]);

    let checks: StockCheckOrder[];
    try {
      checks = await stockCheck.mutateAsync(confirmableIds);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không đối chiếu được tồn kho.",
      );
      return;
    }

    // Server bỏ qua im lặng đơn không còn thuộc chi nhánh này (lưới đã cũ).
    const dropped = confirmableIds.length - checks.length;
    if (dropped > 0) {
      toast.warning(
        `${dropped} đơn đã chọn không còn thuộc chi nhánh này — bấm "Nạp" để tải lại.`,
      );
    }
    if (checks.length === 0) return;

    setConfirmChecks(checks);
    if (checks.every((order) => order.sufficient)) {
      await runConfirm(checks.map((order) => order.orderId));
      return;
    }
    setConfirmOpen(true);
  };

  // Chỉ đơn đang "Chờ xử lý" mới trả về được. Vô hiệu nút là TIỆN ÍCH: API vẫn
  // chặn bằng `ORDER_HAS_INVOICE` / `ORDER_NOT_DISPATCHABLE`, và phải vậy — lưới
  // có thể đã cũ vài giây so với đơn mà thu ngân bên cạnh vừa xử lý.
  const blocked = selected.filter((order) => order.statusLabel !== STATUS_SENT);
  const hasInvoiced = blocked.some(
    (order) => order.statusLabel === STATUS_PROCESSED,
  );
  const canReturn = selected.length > 0 && blocked.length === 0;

  const returnTooltip = (): string => {
    if (selected.length === 0) return "Chọn ít nhất một đơn để trả về";
    if (hasInvoiced) {
      return "Đơn đã phát hành hoá đơn thì không trả về được — bỏ tick đơn đó, hoặc huỷ đơn nếu khách không lấy nữa";
    }
    if (blocked.length > 0) {
      return "Chỉ trả về được đơn đang ở trạng thái chờ xử lý";
    }
    return `Trả ${selected.length} đơn đã chọn về pool chưa phân`;
  };

  // "Huỷ đơn" mở RỘNG hơn "Trả đơn về" đúng ở chỗ đắt giá nhất: đơn đã có hoá
  // đơn bị lối trả về từ chối, nhưng huỷ được — và huỷ nó đảo hoá đơn. Đó là
  // chỗ tooltip trả về đang chỉ người dùng sang.
  const notCancellable = selected.filter(
    (order) => !isCancellableOrder(order.statusLabel),
  );
  const canCancel = selected.length > 0 && notCancellable.length === 0;
  const cancelHasInvoice = selected.some((order) =>
    hasInvoiceToReverse(order.statusLabel),
  );

  const cancelTooltip = (): string => {
    if (selected.length === 0) return "Chọn ít nhất một đơn để huỷ";
    if (notCancellable.length > 0) {
      return "Trong các đơn đang chọn có đơn đã huỷ hoặc đã bị từ chối — bỏ tick đơn đó";
    }
    if (cancelHasInvoice) {
      return `Huỷ ${selected.length} đơn đã chọn — hoá đơn của đơn đã xử lý bị huỷ theo, tồn kho và điểm được hoàn lại, công nợ thu hộ đóng`;
    }
    return `Huỷ ${selected.length} đơn đã chọn, bắt buộc ghi lý do`;
  };

  const items: ToolbarItem[] = [
    {
      id: "stats-items",
      label: "Thống kê hàng hóa",
      icon: Plus,
      onClick: () => undefined,
      disabled: true,
      tooltip: "Chưa hỗ trợ",
    },
    {
      id: "stats-orders",
      label: "Thống kê theo đơn hàng",
      icon: Plus,
      onClick: () => undefined,
      disabled: true,
      tooltip: "Chưa hỗ trợ",
    },
    { id: "sep-1", type: "separator" },
    {
      id: "confirm-orders",
      label: "Duyệt đơn",
      icon: CheckCheck,
      onClick: () => void handleConfirmClick(),
      disabled: !canConfirm,
      tooltip: confirmTooltip(),
    },
    {
      id: "reconcile",
      label: "Đối soát",
      icon: ArrowLeftRight,
      onClick: () => setReconcileOpen(true),
      disabled: checkedOrderIds.length === 0,
      tooltip: "Chọn ít nhất một đơn hàng để đối soát",
    },
    {
      id: "return-to-pool",
      label: "Trả đơn về",
      icon: Undo2,
      onClick: () => setReturnOpen(true),
      disabled: !canReturn,
      tooltip: returnTooltip(),
    },
    {
      id: "cancel-order",
      label: "Huỷ đơn",
      icon: Ban,
      onClick: () => setCancelOpen(true),
      disabled: !canCancel,
      tooltip: cancelTooltip(),
    },
    {
      id: "history",
      label: "Lịch sử",
      icon: History,
      onClick: () => setHistoryOpen(true),
      disabled: !focusedRow,
      tooltip: "Chọn một đơn để xem lịch sử",
    },
    { id: "sep-2", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: reload },
  ];

  return (
    <>
      <PageToolbar items={items} tone="primary" className="m-2 rounded-md" />
      <OrdersReconcileDialog
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
      />
      <OrdersReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        orders={selected}
        onReturned={(returnedIds) =>
          setCheckedOrderIds(
            checkedOrderIds.filter((id) => !returnedIds.includes(id)),
          )
        }
      />
      <ConfirmOrdersDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        checks={confirmChecks}
        confirmed={confirmedIds}
        failures={confirmFailures}
        pending={confirmOrders.isPending}
        onConfirm={() => runConfirm(confirmChecks.map((order) => order.orderId))}
      />
      <OrdersCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orders={selected}
        onCancelled={(cancelledIds) =>
          setCheckedOrderIds(
            checkedOrderIds.filter((id) => !cancelledIds.includes(id)),
          )
        }
      />
      <OrderHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        orderId={focusedRow?.id ?? null}
        scope="branch"
      />
    </>
  );
}
