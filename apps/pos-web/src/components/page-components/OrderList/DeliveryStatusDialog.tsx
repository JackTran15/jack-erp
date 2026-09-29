import { useState } from "react";

import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { WarningIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosTextarea } from "@erp/pos/components/common/PosTextarea/PosTextarea";
import { orderLabelOf } from "@erp/pos/components/page-components/OrderList/DeliverDialog";
import {
  DELIVERY_RETURNED_WARNING,
  DELIVERY_STATUS_BADGE,
  DELIVERY_STATUS_REASON_MAX_LENGTH,
} from "@erp/pos/constants/order-list.constant";
import type { UpdateDeliveryStatusBody } from "@erp/pos/dtos/sales-order.dto";
import type {
  DeliveryOrderRow,
  DeliveryStatus,
} from "@erp/pos/interfaces/sales-order.interface";

export interface DeliveryStatusDialogProps {
  open: boolean;
  rows: ReadonlyArray<DeliveryOrderRow>;
  /** Giao của `allowedNextStatuses` trên mọi đơn tick — chỉ các bước hợp lệ (AC-20). */
  options: ReadonlyArray<DeliveryStatus>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (body: UpdateDeliveryStatusBody) => void;
}

const LABEL_CLASS = "w-36 shrink-0 text-[14px] text-gray-700";

/**
 * Dialog "Cập nhật TT": chọn bước chuyển + lý do tuỳ chọn. "Đã chuyển hoàn"
 * huỷ hoá đơn và hoàn tồn (AC-21) nên phải tick xác nhận trước khi Lưu.
 * Mount lại mỗi lần mở để form về trống.
 */
export function DeliveryStatusDialog({
  open,
  rows,
  options,
  submitting,
  onClose,
  onSubmit,
}: DeliveryStatusDialogProps) {
  const [to, setTo] = useState<DeliveryStatus | null>(
    options.length === 1 ? options[0] : null,
  );
  const [reason, setReason] = useState("");
  const [confirmedReturn, setConfirmedReturn] = useState(false);

  const isReturn = to === "RETURNED";
  const canSave =
    !submitting && rows.length > 0 && to !== null && (!isReturn || confirmedReturn);

  const submit = () => {
    if (!canSave || to === null) return;
    const body: UpdateDeliveryStatusBody = { ids: rows.map((r) => r.id), to };
    if (reason.trim()) body.reason = reason.trim();
    onSubmit(body);
  };

  return (
    <PosDialog open={open} onClose={onClose} width={560}>
      <PosDialog.Header title="Cập nhật trạng thái giao" />
      <PosDialog.Body className="space-y-4">
        <div className="text-[13px] text-gray-600">
          <span className="font-medium text-gray-800">{rows.length} đơn:</span>{" "}
          {rows.map(orderLabelOf).join(", ")}
        </div>

        <PosSelect<DeliveryStatus>
          label="Trạng thái mới"
          fieldLayout="horizontal"
          labelClassName={LABEL_CLASS}
          variant="underline"
          items={options}
          value={to}
          onChange={(next) => {
            setTo(next);
            setConfirmedReturn(false);
          }}
          itemKey={(s) => s}
          renderItem={(s) => DELIVERY_STATUS_BADGE[s].label}
          placeholder="Chọn trạng thái"
          ariaLabel="Trạng thái mới"
        />

        <div className="flex gap-2 text-sm">
          <label className={LABEL_CLASS}>Lý do</label>
          <div className="min-w-0 flex-1">
            <PosTextarea
              value={reason}
              onChange={(v) =>
                setReason(v.slice(0, DELIVERY_STATUS_REASON_MAX_LENGTH))
              }
              placeholder="Không bắt buộc"
            />
          </div>
        </div>

        {isReturn ? (
          <div
            role="alert"
            className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
          >
            <div className="flex items-center gap-2 font-semibold">
              <WarningIcon size={16} />
              {DELIVERY_RETURNED_WARNING}
            </div>
            <PosCheckbox
              size="sm"
              checked={confirmedReturn}
              onChange={setConfirmedReturn}
              label="Tôi hiểu và muốn chuyển hoàn"
            />
          </div>
        ) : null}
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={submit}
        onCancel={onClose}
        saveLabel={submitting ? "Đang lưu…" : "Lưu"}
        saveDisabled={!canSave}
      />
    </PosDialog>
  );
}
