import { useEffect, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { AppModal, Button, Textarea, cn } from "@erp/ui";
import { AlertTriangle, Ban } from "lucide-react";
import { toast } from "sonner";
import { Tabs } from "../../../components/tabs/Tabs";
import { ADMIN_SALES_ORDERS_KEY } from "../../../hooks/orders/use-admin-sales-orders";
import { erpApi, requireErpData } from "../../../lib/erp-api";
import { HttpError } from "../../../lib/http";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";
import type { OrdersDetailTab } from "../../../store/page-stores/orders/orders.interface";
import type { OrderLineRow, OrderRow } from "../_mock/orders.mock";
import { formatOrderMoney } from "../_lib/order-format";
import { OrdersDetailLinesTable } from "./OrdersDetailLinesTable/OrdersDetailLinesTable";
import { OrdersDetailTagsPanel } from "./OrdersDetailTagsPanel/OrdersDetailTagsPanel";

/**
 * Tiền tố khoá cache của lưới đơn chi nhánh — xem `useBranchSalesOrders`.
 *
 * Chép lại ở đây vì hook đó dựng `queryKey` tại chỗ chứ không xuất ra hằng;
 * `OrdersPageToolbar` cũng giữ một bản y hệt vì cùng lý do.
 */
const BRANCH_SALES_ORDERS_KEY = ["branch-sales-orders"] as const;

/**
 * Nhãn trạng thái do `toOrderRow` sinh ra (`STATUS_LABELS` của `_lib/order-mapper`).
 *
 * So bằng NHÃN chứ không bằng mã trạng thái là điều bất đắc dĩ và đã được ghi
 * lại ở `OrdersPageToolbar`: `OrderRow` không mang `status` thô. Đổi một chữ
 * trong `STATUS_LABELS` là phải đổi cả mấy hằng này.
 */
const STATUS_DRAFT = "Lưu tạm";
const STATUS_SENT = "Chờ xử lý";
const STATUS_PROCESSED = "Đã xử lý";

/**
 * Ba trạng thái CÓ đường sang `CANCELLED` trong `VALID_TRANSITIONS` của API.
 *
 * `PROCESSED` nằm trong danh sách này là chủ đích của T-07-01: đơn đã có hoá
 * đơn VẪN huỷ được, và huỷ nó đảo luôn hoá đơn. Đây chính là chỗ "Huỷ đơn"
 * khác "Trả đơn về" — lối trả về từ chối đúng những đơn này.
 */
const CANCELLABLE_STATUS_LABELS: readonly string[] = [
  STATUS_DRAFT,
  STATUS_SENT,
  STATUS_PROCESSED,
];

/** Vô hiệu nút là TIỆN ÍCH — API vẫn là nơi chặn thật (409 nếu lưới đã cũ). */
export function isCancellableOrder(statusLabel: string): boolean {
  return CANCELLABLE_STATUS_LABELS.includes(statusLabel);
}

/** Đơn đã có hoá đơn ⇒ huỷ đơn là ĐẢO TIỀN, không phải xoá một dòng. */
export function hasInvoiceToReverse(statusLabel: string): boolean {
  return statusLabel === STATUS_PROCESSED;
}

/**
 * Mã lỗi 409 khi `CancelInvoiceService` từ chối đảo hoá đơn (A-15).
 *
 * CỐ Ý không có trong {@link CANCEL_ERROR_MESSAGES}: câu của server đã là tiếng
 * Việt và GỌI ĐÍCH DANH mã hoá đơn ("Hoá đơn HD0007 đang ở trạng thái không
 * huỷ được…"). Thay nó bằng một câu cố định ở client là lấy mất đúng cái mã mà
 * người dùng cần để đi tra hoá đơn đó.
 */
const INVOICE_NOT_CANCELLABLE = "INVOICE_NOT_CANCELLABLE";

/**
 * Dấu nhận biết chốt chặn "đã có phiếu trả/đổi tất toán" trong câu của server.
 *
 * Nhận dạng bằng CHỮ là điều bất đắc dĩ, và đây là lý do: đường huỷ có hai
 * nguồn 400 mà không nguồn nào mang mã. Một là chốt chặn trên — tiếng Việt, có
 * mã hoá đơn, đáng hiện nguyên văn. Hai là lỗi cấu hình quỹ tiền mặt từ
 * `CashFundResolverService` — tiếng Anh kèm UUID chi nhánh, không được để lọt
 * ra màn hình. Cho chốt chặn kia một mã riêng ở API là bỏ được đoạn này.
 */
const SETTLED_RETURN_MARKER = "phiếu đổi trả";

/**
 * Câu tiếng Việt cho từng mã lỗi của `POST /mobile/sales-orders/:id/cancel`.
 *
 * Câu của server cho hai mã này không dùng được: 409 chung mang nguyên trạng
 * thái thô trong ngoặc (`Đơn hàng đã được xử lý (CANCELLED)`), 404 thì tiếng
 * Anh.
 */
const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  HTTP_404:
    "Không thấy đơn này trong phạm vi của bạn. Chỉ người lập đơn, hoặc người có quyền duyệt đơn, mới huỷ được.",
  HTTP_409:
    "Đơn không còn ở trạng thái huỷ được — có thể vừa bị người khác huỷ hoặc từ chối. Bấm Nạp rồi xem lại.",
};

const CASH_FUND_MESSAGE =
  "Không đảo được tiền của hoá đơn vì quỹ tiền mặt của chi nhánh chưa cấu hình đúng. Nhờ kế toán kiểm tra quỹ của chi nhánh rồi thử lại.";

/**
 * Mã lỗi nghiệp vụ nằm ở `details.code`, KHÔNG ở `code` mức trên cùng.
 *
 * `HttpExceptionFilter` chỉ đẩy lên `code` cái `HTTP_409`; thân của
 * `ConflictException({ code, message })` được trải vào `details`. Đọc nhầm chỗ
 * là mọi lỗi 409 rơi về cùng một câu chung chung. Cùng một helper với
 * `OrdersPageToolbar` (T-06-02) — cùng một cái bẫy.
 */
function errorCodeOf(error: HttpError): string {
  const details = error.error.details;
  if (details && typeof details === "object") {
    const code = (details as Record<string, unknown>).code;
    if (typeof code === "string" && code) return code;
  }
  return error.error.code;
}

function describeCancelError(error: unknown): { code: string; message: string } {
  if (error instanceof HttpError) {
    const code = errorCodeOf(error);
    if (code === INVOICE_NOT_CANCELLABLE) {
      return { code, message: error.error.message };
    }
    if (error.error.status === 400) {
      return error.error.message.includes(SETTLED_RETURN_MARKER)
        ? { code, message: error.error.message }
        : { code, message: CASH_FUND_MESSAGE };
    }
    return { code, message: CANCEL_ERROR_MESSAGES[code] ?? error.error.message };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "Không huỷ được đơn.",
  };
}

/** Một đơn đang được chọn để huỷ — chỉ những gì dialog cần để gọi tên nó. */
export interface CancelCandidate {
  id: string;
  recipient: string;
  amount: number;
  statusLabel: string;
}

interface CancelFailure {
  orderId: string;
  code: string;
  message: string;
}

interface CancelBatchResult {
  cancelled: string[];
  failed: CancelFailure[];
}

/**
 * Huỷ một MẺ đơn kèm cùng một lý do (AC-23).
 *
 * Gọi TUẦN TỰ và không bao giờ reject, đúng hình của `useReturnSalesOrders`:
 * mỗi đơn là một quyết định riêng — và với đơn đã có hoá đơn thì là một lượt
 * đảo kho/điểm/công nợ riêng — nên một đơn hỏng không được huỷ kết quả của
 * những đơn đã huỷ xong.
 *
 * Invalidate ở `onSettled` chứ không ở `onSuccess`: khi MỌI đơn đều hỏng vì
 * 409 thì lưới càng phải tải lại, vì đúng nghĩa của 409 ở đây là "trạng thái
 * trên màn hình đã cũ". Bắn cả khoá cấp tổ chức để `/orders/dispatch` và
 * `/orders/all` thấy đơn đổi sang Đã huỷ ngay.
 */
function useCancelSalesOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderIds,
      reason,
    }: {
      orderIds: string[];
      reason: string;
    }): Promise<CancelBatchResult> => {
      const cancelled: string[] = [];
      const failed: CancelFailure[] = [];

      for (const orderId of orderIds) {
        try {
          requireErpData(
            await erpApi.POST<unknown>("/mobile/sales-orders/{id}/cancel", {
              params: { path: { id: orderId } },
              body: { reason },
            }),
          );
          cancelled.push(orderId);
        } catch (error) {
          failed.push({ orderId, ...describeCancelError(error) });
        }
      }

      return { cancelled, failed };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BRANCH_SALES_ORDERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ADMIN_SALES_ORDERS_KEY });
    },
  });
}

/**
 * Mã hoá đơn của những đơn đã xử lý trong mẻ, tra theo ĐƯỜNG CHI TIẾT.
 *
 * Đường DANH SÁCH không trả mã hoá đơn (`toView` chỉ tra nó ở `getById`, cố ý,
 * để danh sách không N+1) nên `OrderRow.invoiceCode` luôn rỗng ở cả ba lưới.
 * Mà hộp xác nhận thì PHẢI gọi đích danh mã hoá đơn sắp bị huỷ — nên chỗ này
 * tra thêm, và chỉ tra đúng những đơn đang ở "Đã xử lý".
 *
 * `retry: false` vì tra hụt không phải lỗi chặn: thiếu mã thì hộp thoại lùi về
 * câu đếm số đơn, vẫn cảnh báo đủ hậu quả.
 */
function useInvoiceCodes(
  orders: CancelCandidate[],
  enabled: boolean,
): Record<string, string> {
  const invoicedIds = orders
    .filter((order) => hasInvoiceToReverse(order.statusLabel))
    .map((order) => order.id);

  const queries = useQueries({
    queries: invoicedIds.map((id) => ({
      queryKey: ["sales-order-invoice-code", id],
      queryFn: async (): Promise<string> => {
        const view = requireErpData(
          await erpApi.GET<{ invoiceCode?: string | null }>(
            "/mobile/sales-orders/{id}",
            { params: { path: { id } } },
          ),
        );
        return view.invoiceCode ?? "";
      },
      enabled,
      retry: false,
      staleTime: 60_000,
    })),
  });

  const byId: Record<string, string> = {};
  invoicedIds.forEach((id, index) => {
    const code = queries[index]?.data;
    if (typeof code === "string" && code) byId[id] = code;
  });
  return byId;
}

interface CancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: CancelCandidate[];
  /** Các đơn đã huỷ xong — chỗ gọi dùng để bỏ tick đúng những dòng đó. */
  onCancelled?: (orderIds: string[]) => void;
}

const REASON_MAX_LENGTH = 500;

/**
 * Hộp "Lý do huỷ" + kết quả từng đơn — dùng chung cho cả ba màn.
 *
 * Nằm chung file với panel chi tiết chứ không có thư mục riêng vì `touches:`
 * của T-07-02 chỉ mở đúng hai file giao diện; tách ra là sửa kế hoạch chứ không
 * phải sửa mã. Panel chi tiết là thứ DUY NHẤT cả `/orders`, `/orders/dispatch`
 * và `/orders/all` cùng dựng, nên nó cũng là chỗ đúng để hộp thoại này ở.
 *
 * `reason` bắt buộc ở ĐÂY chứ không ở API: `CancelSalesOrderDto` khai
 * `@IsOptional()` (MISA cho để trống). Quy tắc bắt buộc là của nghiệp vụ đợt
 * này, và nó được giữ bằng `saveDisabled`.
 *
 * Dialog KHÔNG đóng khi có đơn hỏng, y như hộp trả đơn về: "2 đơn đã huỷ, 1 đơn
 * có hoá đơn không đảo được" là hai tin khác nhau, và tin thứ hai chỉ đọc được
 * khi nó còn nằm cạnh đúng dòng đơn đó.
 */
export function OrdersCancelDialog({
  open,
  onOpenChange,
  orders,
  onCancelled,
}: CancelDialogProps) {
  const [reason, setReason] = useState("");
  const [failures, setFailures] = useState<CancelFailure[]>([]);
  const [cancelled, setCancelled] = useState<string[]>([]);
  /**
   * Danh sách chụp lại lúc bấm xác nhận.
   *
   * Sau khi invalidate, đơn đã huỷ đổi trạng thái và chỗ gọi có thể thôi chọn
   * nó, nên prop `orders` co lại. Không chụp thì bảng kết quả trống trơn đúng
   * lúc người dùng cần đọc nó nhất.
   */
  const [submitted, setSubmitted] = useState<CancelCandidate[] | null>(null);

  const cancelMutation = useCancelSalesOrders();
  const pending = cancelMutation.isPending;
  const displayed = submitted ?? orders;
  const trimmedReason = reason.trim();

  const invoiceCodeById = useInvoiceCodes(displayed, open);
  const invoicedOrders = displayed.filter((order) =>
    hasInvoiceToReverse(order.statusLabel),
  );
  const knownCodes = invoicedOrders
    .map((order) => invoiceCodeById[order.id])
    .filter((code): code is string => Boolean(code));
  const invoiceHeadline =
    knownCodes.length === invoicedOrders.length
      ? `Hoá đơn ${knownCodes.join(", ")} sẽ bị huỷ theo đơn.`
      : `Hoá đơn của ${invoicedOrders.length} đơn đã xử lý sẽ bị huỷ theo đơn.`;

  // Mỗi lần mở là một mẻ mới: lý do và kết quả của mẻ trước không được đứng lại đây.
  useEffect(() => {
    if (!open) return;
    setReason("");
    setFailures([]);
    setCancelled([]);
    setSubmitted(null);
  }, [open]);

  const handleSave = async () => {
    if (!trimmedReason || orders.length === 0 || pending) return;

    const batch = [...orders];
    setSubmitted(batch);

    const result = await cancelMutation.mutateAsync({
      orderIds: batch.map((order) => order.id),
      reason: trimmedReason,
    });

    setFailures(result.failed);
    setCancelled(result.cancelled);
    onCancelled?.(result.cancelled);

    if (result.failed.length === 0) {
      toast.success(`Đã huỷ ${result.cancelled.length} đơn.`);
      onOpenChange(false);
      return;
    }

    toast.error(
      `Huỷ được ${result.cancelled.length}/${batch.length} đơn. ` +
        `${result.failed.length} đơn không huỷ được.`,
    );
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Huỷ đơn hàng"
      description={`Huỷ ${displayed.length} đơn đã chọn. Đơn vẫn nằm trong lịch sử ở trạng thái Đã huỷ, không bị xoá.`}
      saveLabel={pending ? "Đang huỷ…" : "Huỷ đơn"}
      cancelLabel="Đóng"
      saveDisabled={pending || !trimmedReason || orders.length === 0}
      onSave={handleSave}
      onCancel={() => onOpenChange(false)}
      defaultWidth={660}
      bodyStretch={false}
      preventOutsideClose
      autoHeight
    >
      <div className="flex flex-col gap-3">
        {invoicedOrders.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold">{invoiceHeadline}</span>
              <span>
                Tồn kho của hoá đơn được hoàn lại, điểm tích đã cộng bị thu hồi,
                điểm khách đã dùng được trả lại, công nợ thu hộ đóng lại. Không
                có nút hoàn tác — muốn bán lại thì phải lập đơn mới.
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            Lý do huỷ <span className="text-destructive">*</span>
          </span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: khách báo không lấy nữa"
            maxLength={REASON_MAX_LENGTH}
            disabled={pending}
            rows={3}
          />
          <span className="text-xs text-muted-foreground">
            Bắt buộc, tối đa {REASON_MAX_LENGTH} ký tự. Lý do được lưu trên đơn
            và đi kèm lượt huỷ hoá đơn.
          </span>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="border border-border px-2 py-1 text-left font-semibold">
                Người nhận
              </th>
              <th className="border border-border px-2 py-1 text-left font-semibold">
                Hoá đơn
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
              const ok = cancelled.includes(order.id);
              return (
                <tr key={order.id}>
                  <td className="border border-border px-2 py-1">
                    {order.recipient || "(chưa có người nhận)"}
                  </td>
                  <td className="border border-border px-2 py-1">
                    {hasInvoiceToReverse(order.statusLabel)
                      ? (invoiceCodeById[order.id] ?? "Đang tra…")
                      : "Chưa có hoá đơn"}
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
                      "Đã huỷ"
                    ) : (
                      "Chờ huỷ"
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

interface Props {
  order: OrderRow | null;
  lines: OrderLineRow[];
  loading: boolean;
}

const TABS: readonly { id: OrdersDetailTab; label: string }[] = [
  { id: "detail", label: "Chi tiết" },
  { id: "tags", label: "Nhãn" },
];

/**
 * Panel chi tiết của đơn đang chọn — CẢ BA màn cùng dựng component này
 * (`OrdersPage`, `OrdersDispatchPage`, `OrdersAllPage` đều truyền đúng bộ prop
 * này), nên nút "Huỷ đơn" đặt ở đây là có mặt trên cả ba, không phải chép ba lần.
 */
export function OrdersDetailPanel({ order, lines, loading }: Props) {
  const detailTab = useOrdersStore((s) => s.detailTab);
  const { setDetailTab } = useOrdersActions();
  const [cancelOpen, setCancelOpen] = useState(false);

  const candidates: CancelCandidate[] = order
    ? [
        {
          id: order.id,
          recipient: order.recipientName,
          amount: order.totalAmount,
          statusLabel: order.paymentStatus,
        },
      ]
    : [];
  const canCancel = candidates.length > 0 && isCancellableOrder(candidates[0].statusLabel);

  const cancelTooltip = (): string => {
    if (!order) return "Chọn một đơn trong lưới để huỷ";
    if (!canCancel) {
      return "Đơn đã huỷ hoặc đã bị từ chối thì không huỷ lại được";
    }
    if (hasInvoiceToReverse(order.paymentStatus)) {
      return "Huỷ đơn — hoá đơn của đơn này bị huỷ theo, tồn kho và điểm được hoàn lại, công nợ thu hộ đóng";
    }
    return "Huỷ đơn, bắt buộc ghi lý do";
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Dải tab của `Tabs` vốn tự mang `border-b bg-muted`; ở đây khung ngoài
          giữ dải đó để nút nằm CÙNG một băng với tab thay vì lơ lửng bên dưới. */}
      <div className="flex shrink-0 items-center justify-between border-b bg-muted pr-2">
        <Tabs
          tabs={TABS}
          activeTab={detailTab}
          onTabChange={setDetailTab}
          className="border-b-0 bg-transparent"
        />
        {/* `title` nằm trên span chứ không trên nút: nút bị `disabled` có
            `pointer-events-none`, tooltip sẽ không bao giờ hiện. */}
        <span title={cancelTooltip()}>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={!canCancel}
            onClick={() => setCancelOpen(true)}
          >
            <Ban className="h-4 w-4" />
            Huỷ đơn
          </Button>
        </span>
      </div>
      {detailTab === "detail" ? (
        <OrdersDetailLinesTable
          lines={lines}
          loading={loading}
          hasFocusedOrder={Boolean(order)}
        />
      ) : (
        <OrdersDetailTagsPanel order={order} />
      )}
      <OrdersCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orders={candidates}
      />
    </div>
  );
}
