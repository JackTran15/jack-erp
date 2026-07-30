import { PlusIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PrintSettingsPaymentRow } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsContentForm/PrintSettingsPaymentsEditor/PrintSettingsPaymentRow/PrintSettingsPaymentRow";
import type { SampleInvoicePayment } from "@erp/pos/interfaces/print-sample-invoice.interface";

export interface PrintSettingsPaymentsEditorProps {
  payments: SampleInvoicePayment[];
  onAdd: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Omit<SampleInvoicePayment, "id">>,
  ) => void;
  onRemove: (id: string) => void;
}

/** Mỗi dòng ở đây in ra một dòng đậm trong khối tổng kết của bill. */
export function PrintSettingsPaymentsEditor({
  payments,
  onAdd,
  onUpdate,
  onRemove,
}: PrintSettingsPaymentsEditorProps) {
  return (
    <div className="flex flex-col gap-2">
      {payments.map((payment) => (
        <PrintSettingsPaymentRow
          key={payment.id}
          payment={payment}
          onChange={(patch) => onUpdate(payment.id, patch)}
          onRemove={() => onRemove(payment.id)}
        />
      ))}

      {payments.length === 0 ? (
        <p className="text-[12px] text-gray-500">
          Chưa có phương thức nào — bill sẽ không in dòng thanh toán.
        </p>
      ) : null}

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-md border border-dashed border-gray-300 px-3 text-sm font-medium text-gray-700 hover:border-[#5B5BD6] hover:text-[#5B5BD6]"
      >
        <PlusIcon size={14} />
        Thêm phương thức
      </button>
    </div>
  );
}
