import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { cn } from "@erp/ui";
import { toast } from "sonner";

import {
  BarChartUpIcon,
  CoinDollarIcon,
  PackageSendIcon,
  PrinterIcon,
  RefreshIcon,
  TagIcon,
  TruckIcon,
  type IconProps,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { showBatchResultToast } from "@erp/pos/components/page-components/OrderList/BatchResultToast";
import {
  DeliverDialog,
  orderLabelOf,
} from "@erp/pos/components/page-components/OrderList/DeliverDialog";
import { DeliveryStatusDialog } from "@erp/pos/components/page-components/OrderList/DeliveryStatusDialog";
import {
  DELIVERABLE_STATUSES,
  DELIVERY_ERROR_MESSAGES,
  ORDER_UNSUPPORTED_TOOLTIP,
  SALES_ORDER_DELIVER_PERMISSION,
} from "@erp/pos/constants/order-list.constant";
import {
  useDeliverSalesOrdersMutation,
  useUpdateDeliveryStatusMutation,
} from "@erp/pos/hooks/react-query/use-query-sales-order";
import { useCurrentUserQuery } from "@erp/pos/hooks/react-query/use-query-user";
import type {
  DeliverSalesOrdersBody,
  UpdateDeliveryStatusBody,
} from "@erp/pos/dtos/sales-order.dto";
import type {
  DeliveryOrderRow,
  DeliveryStatus,
  SalesOrderBatchResult,
} from "@erp/pos/interfaces/sales-order.interface";

export interface OrderToolbarProps {
  /** Các đơn đang tick — nguồn cho Giao hàng / Hoàn thành / Cập nhật TT (UOW-05). */
  selectedRows: ReadonlyArray<DeliveryOrderRow>;
  /** Gọi sau khi một action batch xong (bỏ tick). */
  onActionDone: () => void;
}

/** Biểu tượng check-circle cho "Hoàn thành" (PosIcons chưa có). */
function CheckCircleIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

/**
 * Thay `message` của đơn lỗi bằng câu tiếng Việt theo `DELIVERY_ERROR_MESSAGES`;
 * mã không có trong bảng (DEBT_OUTSTANDING, lỗi huỷ hoá đơn…) giữ nguyên
 * thông điệp server. `showBatchResultToast` dùng `message` cho mã nó không biết.
 */
function localizeResults(
  results: ReadonlyArray<SalesOrderBatchResult>,
): SalesOrderBatchResult[] {
  return results.map((r) =>
    !r.ok && r.code && DELIVERY_ERROR_MESSAGES[r.code]
      ? { ...r, message: DELIVERY_ERROR_MESSAGES[r.code] }
      : r,
  );
}

/** Lỗi cả request (mạng / 400 / 403 / 5xx) — `http` ném `Error("HTTP <status>: <body>")`. */
function requestErrorMessage(err: Error, fallback: string): string {
  const match = /^HTTP (\d+): ([\s\S]*)$/.exec(err.message);
  if (!match) return err.message || fallback;
  if (match[1] === "403") return "Bạn không có quyền thao tác giao hàng.";
  try {
    const body = JSON.parse(match[2]) as { code?: unknown; message?: unknown };
    if (typeof body.code === "string" && DELIVERY_ERROR_MESSAGES[body.code]) {
      return DELIVERY_ERROR_MESSAGES[body.code];
    }
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    // body không phải JSON — rơi xuống thông điệp chung.
  }
  return fallback;
}

/** Các bước chuyển mà MỌI đơn tick đều cho phép (giữ thứ tự của đơn đầu). */
function commonNextStatuses(
  rows: ReadonlyArray<DeliveryOrderRow>,
): DeliveryStatus[] {
  if (rows.length === 0) return [];
  return rows[0].allowedNextStatuses.filter((s) =>
    rows.every((r) => r.allowedNextStatuses.includes(s)),
  );
}

type OpenDialog = "deliver" | "status" | null;

interface ToolbarButtonProps {
  icon: ComponentType<IconProps>;
  children: ReactNode;
  disabled: boolean;
  /** Tooltip; đặt ở wrapper vì nút disabled không nhận hover. */
  tooltip?: string;
  onClick?: () => void;
}

function ToolbarButton({
  icon: Icon,
  children,
  disabled,
  tooltip,
  onClick,
}: ToolbarButtonProps) {
  return (
    <span title={tooltip} className="inline-flex shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors",
          disabled
            ? "pointer-events-none text-gray-400"
            : "text-[#4B5163] hover:bg-[#F3F4F6] hover:text-[#1F2233]",
        )}
      >
        <Icon size={16} />
        {children}
      </button>
    </span>
  );
}

/**
 * Hàng nút thao tác của trang "Đơn hàng". Gửi đơn hàng, Thu COD, Gắn nhãn,
 * Thống kê hàng hóa, In phiếu GH ngoài phạm vi đợt này → disabled + tooltip
 * "Chưa hỗ trợ" (AC-17). Giao hàng / Hoàn thành / Cập nhật TT chạy trên
 * `selectedRows` (UOW-05) và bị ẩn khi thiếu `pos.sales-order.deliver` (AC-26).
 * Trả fragment: nút nằm chung hàng flex với `OrderFilterBar`; "Cập nhật TT" `ml-auto` về cuối hàng.
 */
export function OrderToolbar({ selectedRows, onActionDone }: OrderToolbarProps) {
  const { data: currentUser } = useCurrentUserQuery();
  // Chỉ là lớp ẩn nút — backend mới là chỗ chặn thật.
  const canDeliver = (currentUser?.permissions ?? []).includes(
    SALES_ORDER_DELIVER_PERMISSION,
  );
  const deliverMutation = useDeliverSalesOrdersMutation();
  const statusMutation = useUpdateDeliveryStatusMutation();
  const busy = deliverMutation.isPending || statusMutation.isPending;
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  const hasSelection = selectedRows.length > 0;
  // Hoá đơn nháp vẫn tick được — server trả INVOICE_NOT_FINALIZED cho từng đơn (AC-19).
  const deliverEnabled =
    !busy &&
    hasSelection &&
    selectedRows.every(
      (r) =>
        r.status !== "CANCELLED" && DELIVERABLE_STATUSES.includes(r.deliveryStatus),
    );
  const nextStatuses = useMemo(
    () => commonNextStatuses(selectedRows),
    [selectedRows],
  );
  const statusEnabled = !busy && hasSelection && nextStatuses.length > 0;
  const completeEnabled = !busy && nextStatuses.includes("COMPLETED");

  const labelOf = (id: string) => {
    const row = selectedRows.find((r) => r.id === id);
    return row ? orderLabelOf(row) : id;
  };

  const finish = (
    results: ReadonlyArray<SalesOrderBatchResult>,
    actionLabel: string,
  ) => {
    showBatchResultToast({
      results: localizeResults(results),
      actionLabel,
      labelOf,
    });
    setOpenDialog(null);
    onActionDone();
  };

  const deliver = (body: DeliverSalesOrdersBody) =>
    deliverMutation.mutate(body, {
      onSuccess: ({ results }) => finish(results, "đã giao"),
      onError: (err) =>
        toast.error(requestErrorMessage(err, "Giao hàng thất bại. Vui lòng thử lại.")),
    });

  const updateStatus = (body: UpdateDeliveryStatusBody, actionLabel: string) =>
    statusMutation.mutate(body, {
      onSuccess: ({ results }) => finish(results, actionLabel),
      onError: (err) =>
        toast.error(
          requestErrorMessage(err, "Cập nhật trạng thái thất bại. Vui lòng thử lại."),
        ),
    });

  const complete = () => {
    if (!completeEnabled) return;
    updateStatus(
      { ids: selectedRows.map((r) => r.id), to: "COMPLETED" },
      "đã hoàn thành",
    );
  };

  return (
    <>
        <ToolbarButton
          icon={PackageSendIcon}
          disabled
          tooltip={ORDER_UNSUPPORTED_TOOLTIP}
        >
          Gửi đơn hàng
        </ToolbarButton>
        {canDeliver ? (
          <ToolbarButton
            icon={TruckIcon}
            disabled={!deliverEnabled}
            onClick={() => setOpenDialog("deliver")}
          >
            Giao hàng
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          icon={CoinDollarIcon}
          disabled
          tooltip={ORDER_UNSUPPORTED_TOOLTIP}
        >
          Thu COD
        </ToolbarButton>
        {canDeliver ? (
          <ToolbarButton
            icon={CheckCircleIcon}
            disabled={!completeEnabled}
            onClick={complete}
          >
            Hoàn thành
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          icon={TagIcon}
          disabled
          tooltip={ORDER_UNSUPPORTED_TOOLTIP}
        >
          Gắn nhãn
        </ToolbarButton>
        <ToolbarButton
          icon={BarChartUpIcon}
          disabled
          tooltip={ORDER_UNSUPPORTED_TOOLTIP}
        >
          Thống kê hàng hóa
        </ToolbarButton>
        <ToolbarButton
          icon={PrinterIcon}
          disabled
          tooltip={ORDER_UNSUPPORTED_TOOLTIP}
        >
          In phiếu GH
        </ToolbarButton>

      {canDeliver ? (
        <button
          type="button"
          disabled={!statusEnabled}
          onClick={() => setOpenDialog("status")}
          className={cn(
            "ml-auto inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-[14px] font-semibold transition-colors",
            statusEnabled
              ? "bg-[#6366F1] text-white hover:bg-[#4F46E5]"
              : "cursor-not-allowed bg-gray-100 text-gray-400",
          )}
        >
          <RefreshIcon size={16} />
          Cập nhật TT
        </button>
      ) : null}

      {openDialog === "deliver" ? (
        <DeliverDialog
          open
          rows={selectedRows}
          submitting={deliverMutation.isPending}
          onClose={() => setOpenDialog(null)}
          onSubmit={deliver}
        />
      ) : null}
      {openDialog === "status" ? (
        <DeliveryStatusDialog
          open
          rows={selectedRows}
          options={nextStatuses}
          submitting={statusMutation.isPending}
          onClose={() => setOpenDialog(null)}
          onSubmit={(body) => updateStatus(body, "đã cập nhật trạng thái")}
        />
      ) : null}
    </>
  );
}
