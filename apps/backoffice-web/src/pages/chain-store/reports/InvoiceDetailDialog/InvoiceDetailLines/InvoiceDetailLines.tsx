import type { InvoiceDetailView } from "@erp/shared-interfaces";
import { formatMoney, formatQuantity } from "../_lib/format";

interface Props {
  detail: InvoiceDetailView;
}

const TH = "border border-border bg-muted px-2 py-1.5 font-bold";
const TD = "border border-border px-2 py-1 align-middle";

export function InvoiceDetailLines({ detail }: Props) {
  const totalQty = detail.lines.reduce((sum, l) => sum + Number(l.quantity ?? 0), 0);

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="text-foreground">
          <th className={`${TH} w-12 text-center`}>STT</th>
          <th className={`${TH} w-28 text-left`}>Mã SKU</th>
          <th className={`${TH} text-left`}>Tên hàng hóa</th>
          <th className={`${TH} w-16 text-center`}>ĐVT</th>
          <th className={`${TH} w-20 text-right`}>Số lượng</th>
          <th className={`${TH} w-24 text-right`}>Đơn giá</th>
          <th className={`${TH} w-28 text-right`}>Tiền hàng</th>
          <th className={`${TH} w-24 text-right`}>Tiền KM</th>
          <th className={`${TH} w-28 text-right`}>Thành tiền</th>
          <th className={`${TH} w-36 text-left`}>Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        {detail.lines.length === 0 ? (
          <tr>
            <td
              className={`${TD} text-center text-muted-foreground`}
              colSpan={10}
            >
              Không có dòng hàng hóa.
            </td>
          </tr>
        ) : (
          detail.lines.map((l, idx) => (
            <tr key={`${l.sku}-${idx}`} className={idx % 2 === 1 ? "bg-muted/30" : ""}>
              <td className={`${TD} text-center`}>{idx + 1}</td>
              <td className={`${TD} text-left`}>{l.sku}</td>
              <td className={`${TD} text-left`}>{l.name}</td>
              <td className={`${TD} text-center`}>{l.unit}</td>
              <td className={`${TD} text-right tabular-nums`}>
                {formatQuantity(l.quantity)}
              </td>
              <td className={`${TD} text-right tabular-nums`}>
                {formatMoney(l.unitPrice)}
              </td>
              <td className={`${TD} text-right tabular-nums`}>
                {formatMoney(l.lineAmount)}
              </td>
              <td className={`${TD} text-right tabular-nums`}>
                {formatMoney(l.discount)}
              </td>
              <td className={`${TD} text-right tabular-nums`}>
                {formatMoney(l.lineTotal)}
              </td>
              <td className={`${TD} text-left`}>{l.note ?? ""}</td>
            </tr>
          ))
        )}
      </tbody>
      {detail.lines.length > 0 ? (
        <tfoot>
          <tr className="bg-muted font-bold">
            <td className={`${TD} text-center`} colSpan={4} />
            <td className={`${TD} text-right tabular-nums`}>
              {formatQuantity(totalQty)}
            </td>
            <td className={TD} colSpan={5} />
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}
