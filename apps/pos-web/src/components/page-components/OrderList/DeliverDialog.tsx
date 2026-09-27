import { useState } from "react";

import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosTextarea } from "@erp/pos/components/common/PosTextarea/PosTextarea";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import {
  DELIVER_PACKAGE_INFO_MAX_LENGTH,
  DELIVER_TRACKING_CODE_MAX_LENGTH,
  DELIVERY_PARTNER_EMPTY_HINT,
} from "@erp/pos/constants/order-list.constant";
import { useDeliveryPartnersQuery } from "@erp/pos/hooks/react-query/use-query-sales-order";
import type { DeliverSalesOrdersBody } from "@erp/pos/dtos/sales-order.dto";
import type {
  DeliveryOrderRow,
  DeliveryPartnerRow,
} from "@erp/pos/interfaces/sales-order.interface";

export interface DeliverDialogProps {
  open: boolean;
  /** Các đơn đang tick — cùng một bộ thông tin giao áp cho tất cả. */
  rows: ReadonlyArray<DeliveryOrderRow>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (body: DeliverSalesOrdersBody) => void;
}

/** Mục "(Không chọn)" đầu danh sách — đối tác là tuỳ chọn (A-04). */
const NO_PARTNER: DeliveryPartnerRow = { id: "", code: "", name: "(Không chọn)" };

const LABEL_CLASS = "w-36 shrink-0 text-[14px] text-gray-700";

/**
 * `PosNumberInput` chỉ giữ `number`; bộ parse này trả -1 khi ô trống để
 * `onChange` vẫn chạy khi người dùng xoá hết, rồi quy về `null`.
 */
const EMPTY_FEE_SENTINEL = -1;
function parseFee(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits === "" ? EMPTY_FEE_SENTINEL : Number(digits);
}

/** Nhãn đơn trong dialog / toast — mã đơn (OCM), không có thì số HĐ, cuối cùng id. */
export function orderLabelOf(row: DeliveryOrderRow): string {
  return row.externalOrderId ?? row.invoiceCode ?? row.id;
}

/**
 * Dialog "Giao hàng" (AC-18): đối tác, mã vận đơn, phí trả ĐT, gói hàng.
 * Ô bỏ trống thì không gửi — server lưu NULL, không phải 0. Mount lại mỗi lần
 * mở để form về trống.
 */
export function DeliverDialog({
  open,
  rows,
  submitting,
  onClose,
  onSubmit,
}: DeliverDialogProps) {
  const partnersQuery = useDeliveryPartnersQuery();
  const partners = partnersQuery.data ?? [];
  const [partner, setPartner] = useState<DeliveryPartnerRow>(NO_PARTNER);
  const [trackingCode, setTrackingCode] = useState("");
  const [partnerShippingFee, setPartnerShippingFee] = useState<number | null>(
    null,
  );
  const [packageInfo, setPackageInfo] = useState("");

  const submit = () => {
    if (submitting || rows.length === 0) return;
    const body: DeliverSalesOrdersBody = { ids: rows.map((r) => r.id) };
    if (partner.id) body.deliveryPartnerId = partner.id;
    if (trackingCode.trim()) body.trackingCode = trackingCode.trim();
    if (partnerShippingFee !== null) body.partnerShippingFee = partnerShippingFee;
    if (packageInfo.trim()) body.packageInfo = packageInfo.trim();
    onSubmit(body);
  };

  return (
    <PosDialog open={open} onClose={onClose} width={560}>
      <PosDialog.Header title="Giao hàng" />
      <PosDialog.Body className="space-y-4">
        <div className="text-[13px] text-gray-600">
          <span className="font-medium text-gray-800">{rows.length} đơn:</span>{" "}
          {rows.map(orderLabelOf).join(", ")}
        </div>

        <div>
          <PosSelect<DeliveryPartnerRow>
            label="ĐT giao hàng"
            fieldLayout="horizontal"
            labelClassName={LABEL_CLASS}
            variant="underline"
            items={[NO_PARTNER, ...partners]}
            value={partner}
            onChange={setPartner}
            itemKey={(p) => p.id || "__none__"}
            renderItem={(p) => p.name}
            ariaLabel="ĐT giao hàng"
            disabled={partnersQuery.isLoading}
          />
          {!partnersQuery.isLoading && partners.length === 0 ? (
            <p className="mt-1 pl-36 text-[12px] text-gray-500">
              {DELIVERY_PARTNER_EMPTY_HINT}
            </p>
          ) : null}
        </div>

        <PosTextInput
          label="Mã vận đơn"
          fieldLayout="horizontal"
          labelClassName={LABEL_CLASS}
          variant="underline"
          value={trackingCode}
          onChange={(v) =>
            setTrackingCode(v.slice(0, DELIVER_TRACKING_CODE_MAX_LENGTH))
          }
          ariaLabel="Mã vận đơn"
        />

        <PosNumberInput
          label="Phí GH trả ĐT"
          fieldLayout="horizontal"
          labelClassName={LABEL_CLASS}
          variant="underline"
          value={partnerShippingFee ?? 0}
          displayValue={partnerShippingFee === null ? "" : undefined}
          parser={parseFee}
          onChange={(n) =>
            setPartnerShippingFee(n === EMPTY_FEE_SENTINEL ? null : n)
          }
          placeholder="Bỏ trống nếu chưa biết"
          ariaLabel="Phí GH trả ĐT"
        />

        <div className="flex gap-2 text-sm">
          <label className={LABEL_CLASS}>Thông tin gói hàng</label>
          <div className="min-w-0 flex-1">
            <PosTextarea
              value={packageInfo}
              onChange={(v) =>
                setPackageInfo(v.slice(0, DELIVER_PACKAGE_INFO_MAX_LENGTH))
              }
              placeholder="vd 2kg, 30×20×10cm"
            />
          </div>
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={submit}
        onCancel={onClose}
        saveLabel={submitting ? "Đang lưu…" : "Lưu"}
        saveDisabled={submitting || rows.length === 0}
      />
    </PosDialog>
  );
}
